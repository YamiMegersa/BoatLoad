import * as THREE from 'three';
import { CellState, CELL_SIZE } from './VoxelGrid.js';

// ---------------------------------------------------------------------------
// Material palette for individual damage/flood meshes
// ---------------------------------------------------------------------------

/** Voxel material — white base so instance colors show through */
const intactMaterial = new THREE.MeshLambertMaterial({ color: 0xffffff });
const damagedMaterial = new THREE.MeshLambertMaterial({ color: 0x5c3317 });

/** Missing/Broken/Damaged cell — prominent red outline */
const missingMaterial = new THREE.LineBasicMaterial({
  color: 0xff1533,
  transparent: true,
  opacity: 0.95,
  depthTest: false,
});

/** Flooded bilge — translucent ocean blue */
const floodedMaterial = new THREE.MeshPhongMaterial({
  color: 0x474b6b,
  transparent: true,
  opacity: 0.62,
});

/**
 * Maximum number of simultaneously active individual (DAMAGED/FLOODED) meshes.
 * When the cap is reached, the oldest mesh is recycled.
 */
const MAX_INDIVIDUAL_MESHES = 1024;
const BOX_GEO = new THREE.BoxGeometry(CELL_SIZE, CELL_SIZE, CELL_SIZE);
const OUTLINE_BOX_GEO = new THREE.BoxGeometry(CELL_SIZE * 1.04, CELL_SIZE * 1.04, CELL_SIZE * 1.04);
const EDGES_GEO = new THREE.EdgesGeometry(OUTLINE_BOX_GEO);

// ---------------------------------------------------------------------------
// ChunkRenderer
// ---------------------------------------------------------------------------

/**
 * ChunkRenderer — owns all Three.js visual objects for a ship's VoxelGrid.
 *
 * Rendering strategy:
 *  - When gltfScene is provided: Keeps the original textured GLB voxel ship model directly.
 *    Only overlays MISSING, DAMAGED, FLOODED, and REPAIRED indicator voxels.
 *  - When gltfScene is absent: Fallback InstancedMesh for INTACT cells.
 */
export class ChunkRenderer {
  constructor() {
    this.container = new THREE.Group();
    
    this._gltfScene = null;
    this._instancedMesh = null;
    this._instanceIdxMap = new Map(); // grid flatIdx -> instance ID
    this._nextInstanceId = 0;

    /** Maps flat grid index → individual THREE.Mesh for DAMAGED/FLOODED/REPAIRED/MISSING cells. */
    this._individualMeshes = new Map();
    /** FIFO queue to enforce MAX_INDIVIDUAL_MESHES. */
    this._individualQueue = [];

    this._scene = null;
    this._showMissingOutlines = false;
    this._voxel3DTexture = null;
    this._voxelUniforms = null;
  }

  /**
   * Initialise from a freshly-built VoxelGrid and optional gltfScene.
   * If gltfScene is provided, it is kept as the authentic visual model of the ship.
   *
   * @param {import('./VoxelGrid.js').VoxelGrid} grid
   * @param {THREE.Scene} scene
   * @param {THREE.Object3D} [gltfScene]
   * @param {object} [options]
   * @param {boolean} [options.showMissingOutlines=false] Whether to draw red wireframe boxes on MISSING cells (e.g. true during shipyard repairs)
   */
  init(grid, scene, gltfScene = null, options = {}) {
    this._scene = scene;
    this._scene.add(this.container);
    this._grid = grid;
    this._gltfScene = gltfScene;
    this._showMissingOutlines = options.showMissingOutlines !== undefined ? Boolean(options.showMissingOutlines) : false;

    if (this._gltfScene) {
      this.container.add(this._gltfScene);
      this._instancedMesh = null;
      this._setupGltfVoxelCulling(grid);
    } else {
      const maxIntact = grid.width * grid.height * grid.depth;
      this._instancedMesh = new THREE.InstancedMesh(BOX_GEO, intactMaterial, maxIntact);
      this._instancedMesh.count = 0;
      
      // We must manually inform Three.js that we intend to update colors dynamically
      this._instancedMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      if (this._instancedMesh.instanceColor) {
        this._instancedMesh.instanceColor.setUsage(THREE.DynamicDrawUsage);
      }
      
      this.container.add(this._instancedMesh);
    }

    // Perform a full pass to spawn initial meshes
    this._fullRebuild(grid);
  }

  /**
   * Update the container inverse world matrix uniform for GLTF voxel culling.
   * Call whenever container transform changes.
   */
  updateTransform() {
    if (this._voxelUniforms && this.container) {
      this.container.updateMatrixWorld(true);
      this._voxelUniforms.uContainerWorldInverse.value.copy(this.container.matrixWorld).invert();
    }
  }

  /**
   * Configure whether MISSING cells render red wireframe outline boxes.
   * In destruction editing, disabling outlines ensures damaged cells are purely missing/transparent.
   *
   * @param {boolean} show
   */
  setShowMissingOutlines(show) {
    const shouldShow = Boolean(show);
    if (this._showMissingOutlines === shouldShow) return;
    this._showMissingOutlines = shouldShow;
    if (!this._showMissingOutlines) {
      for (const [flatIdx, mesh] of this._individualMeshes.entries()) {
        if (mesh.type === 'LineSegments' || mesh.isLineSegments || mesh.material === missingMaterial) {
          this._disposeIndividualMesh(mesh);
          this._individualMeshes.delete(flatIdx);
          const qIdx = this._individualQueue.indexOf(flatIdx);
          if (qIdx !== -1) this._individualQueue.splice(qIdx, 1);
        }
      }
    } else if (this._grid) {
      this._fullRebuild(this._grid);
    }
  }

  /**
   * Synchronise renderer state with any dirty cells in the grid.
   * Call this once per frame (or whenever EventBus fires 'gridDirty').
   *
   * @param {import('./VoxelGrid.js').VoxelGrid} grid
   */
  sync(grid) {
    if (this._voxel3DTexture) {
      this._voxel3DTexture.needsUpdate = true;
      this.updateTransform();
    }

    const dirty = grid.consumeDirty();
    if (dirty.size === 0) return;

    let instanceMatrixDirty = false;
    let instanceColorDirty = false;

    // Update individual meshes for damaged/flooded cells
    for (const flatIdx of dirty) {
      const z = Math.floor(flatIdx / (grid.width * grid.height));
      const rem = flatIdx % (grid.width * grid.height);
      const y = Math.floor(rem / grid.width);
      const x = rem % grid.width;
      const state = grid.getState(x, y, z);

      if (this._syncCell(grid, x, y, z, flatIdx, state)) {
        instanceMatrixDirty = true;
        instanceColorDirty = true;
      }
    }

    if (instanceMatrixDirty && this._instancedMesh) {
      this._instancedMesh.instanceMatrix.needsUpdate = true;
      if (this._instancedMesh.instanceColor) {
        this._instancedMesh.instanceColor.needsUpdate = true;
      }
    }
  }

  /**
   * Tear down all Three.js objects and free GPU memory.
   * @param {THREE.Scene} scene
   */
  dispose(scene) {
    if (this.container) {
      scene.remove(this.container);
      if (this._gltfScene) {
        this.container.remove(this._gltfScene);
        this._gltfScene = null;
      }
    }
    
    if (this._voxel3DTexture) {
      this._voxel3DTexture.dispose();
      this._voxel3DTexture = null;
    }
    this._voxelUniforms = null;

    if (this._instancedMesh) {
      this._instancedMesh.dispose();
      this._instancedMesh = null;
    }

    for (const mesh of this._individualMeshes.values()) {
      this.container.remove(mesh);
      if (mesh.geometry !== BOX_GEO && mesh.geometry !== EDGES_GEO && mesh.geometry !== OUTLINE_BOX_GEO) {
        mesh.geometry.dispose();
      }
      if (mesh.material && mesh.material !== missingMaterial && mesh.material !== damagedMaterial && mesh.material !== floodedMaterial) {
        mesh.material.dispose();
      }
    }
    this._individualMeshes.clear();
    this._individualQueue.length = 0;
    this._scene = null;
  }

  // -------------------------------------------------------------------------
  // Internal helpers
  // -------------------------------------------------------------------------

  _setupGltfVoxelCulling(grid) {
    if (!this._gltfScene || !grid) return;

    if (this._voxel3DTexture) {
      this._voxel3DTexture.dispose();
      this._voxel3DTexture = null;
    }

    this._voxel3DTexture = new THREE.Data3DTexture(
      grid.data,
      grid.width,
      grid.height,
      grid.depth
    );
    this._voxel3DTexture.format = THREE.RedFormat;
    this._voxel3DTexture.type = THREE.UnsignedByteType;
    this._voxel3DTexture.minFilter = THREE.NearestFilter;
    this._voxel3DTexture.magFilter = THREE.NearestFilter;
    this._voxel3DTexture.wrapS = THREE.ClampToEdgeWrapping;
    this._voxel3DTexture.wrapT = THREE.ClampToEdgeWrapping;
    this._voxel3DTexture.wrapR = THREE.ClampToEdgeWrapping;
    this._voxel3DTexture.unpackAlignment = 1;
    this._voxel3DTexture.needsUpdate = true;

    this._voxelUniforms = {
      uContainerWorldInverse: { value: new THREE.Matrix4() },
      uGridDims: { value: new THREE.Vector3(grid.width, grid.height, grid.depth) },
      uVoxelGrid: { value: this._voxel3DTexture },
    };

    this.updateTransform();

    this._gltfScene.traverse((child) => {
      if (child.isMesh && child.material) {
        const materials = Array.isArray(child.material) ? child.material : [child.material];
        for (const mat of materials) {
          mat.side = THREE.DoubleSide;

          if (mat._hasVoxelCulling) continue;
          mat._hasVoxelCulling = true;

          const origOnBeforeCompile = mat.onBeforeCompile ? mat.onBeforeCompile.bind(mat) : null;

          mat.onBeforeCompile = (shader, renderer) => {
            if (origOnBeforeCompile) origOnBeforeCompile(shader, renderer);

            shader.uniforms.uContainerWorldInverse = this._voxelUniforms.uContainerWorldInverse;
            shader.uniforms.uGridDims = this._voxelUniforms.uGridDims;
            shader.uniforms.uVoxelGrid = this._voxelUniforms.uVoxelGrid;

            shader.vertexShader = 'varying vec3 vVoxelWorldPos;\n' + shader.vertexShader;
            shader.vertexShader = shader.vertexShader.replace(
              '#include <worldpos_vertex>',
              '#include <worldpos_vertex>\n' +
              'vVoxelWorldPos = (modelMatrix * vec4(transformed, 1.0)).xyz;'
            );

            shader.fragmentShader =
              'varying vec3 vVoxelWorldPos;\n' +
              'uniform mat4 uContainerWorldInverse;\n' +
              'uniform vec3 uGridDims;\n' +
              'uniform sampler3D uVoxelGrid;\n' +
              shader.fragmentShader;

            shader.fragmentShader = shader.fragmentShader.replace(
              '#include <clipping_planes_fragment>',
              '#include <clipping_planes_fragment>\n' +
              'vec3 vContainerPos = (uContainerWorldInverse * vec4(vVoxelWorldPos, 1.0)).xyz;\n' +
              'if (vContainerPos.x >= 0.0 && vContainerPos.x < uGridDims.x &&\n' +
              '    vContainerPos.y >= 0.0 && vContainerPos.y < uGridDims.y &&\n' +
              '    vContainerPos.z >= 0.0 && vContainerPos.z < uGridDims.z) {\n' +
              '  vec3 uvw = vContainerPos / uGridDims;\n' +
              '  float rawVal = texture(uVoxelGrid, uvw).r;\n' +
              '  float stateVal = floor(rawVal * 255.0 + 0.5);\n' +
              '  if (stateVal == 2.0 || stateVal == 3.0 || stateVal == 5.0) {\n' +
              '    discard;\n' +
              '  }\n' +
              '}\n'
            );
          };

          mat.customProgramCacheKey = () => 'voxelCulling_v1';
          mat.needsUpdate = true;
        }
      }
    });
  }

  _fullRebuild(grid) {
    for (const mesh of this._individualMeshes.values()) {
      this._disposeIndividualMesh(mesh);
    }
    this._individualMeshes.clear();
    this._individualQueue.length = 0;
    
    if (this._instancedMesh) {
      this._instancedMesh.count = 0;
    }
    this._instanceIdxMap.clear();
    this._nextInstanceId = 0;

    grid.forEach((x, y, z, state, flatIdx) => {
      this._syncCell(grid, x, y, z, flatIdx, state);
    });

    if (this._instancedMesh) {
      this._instancedMesh.instanceMatrix.needsUpdate = true;
      if (this._instancedMesh.instanceColor) {
        this._instancedMesh.instanceColor.needsUpdate = true;
      }
    }
  }

  /** Returns true if fallback InstancedMesh was modified */
  _syncCell(grid, x, y, z, flatIdx, state) {
    let instanceDirty = false;

    // 1. Manage Fallback InstancedMesh
    if (this._instancedMesh) {
      if (state === CellState.INTACT || state === CellState.REPAIRED) {
        const color = new THREE.Color(grid.getColor(x, y, z));
        
        if (!this._instanceIdxMap.has(flatIdx)) {
          // Allocate new instance ID
          const iid = this._nextInstanceId++;
          this._instanceIdxMap.set(flatIdx, iid);
          this._instancedMesh.count = this._nextInstanceId;
          
          const matrix = new THREE.Matrix4().setPosition(grid.toWorldPos(x, y, z));
          this._instancedMesh.setMatrixAt(iid, matrix);
          this._instancedMesh.setColorAt(iid, color);
          instanceDirty = true;
        } else {
          // Ensure it's scaled up if it was previously hidden
          const iid = this._instanceIdxMap.get(flatIdx);
          const matrix = new THREE.Matrix4().setPosition(grid.toWorldPos(x, y, z));
          this._instancedMesh.setMatrixAt(iid, matrix);
          this._instancedMesh.setColorAt(iid, color);
          instanceDirty = true;
        }
      } else {
        if (this._instanceIdxMap.has(flatIdx)) {
          // Hide it by scaling to 0
          const iid = this._instanceIdxMap.get(flatIdx);
          const matrix = new THREE.Matrix4().makeScale(0, 0, 0);
          this._instancedMesh.setMatrixAt(iid, matrix);
          instanceDirty = true;
        }
      }
    }

    // 2. Manage Individual Overlays
    switch (state) {
      case CellState.INTACT:
      case CellState.EMPTY:
        this._removeIndividual(flatIdx);
        break;

      case CellState.REPAIRED:
        if (this._gltfScene) {
          const hex = grid.getColor(x, y, z);
          const mat = new THREE.MeshLambertMaterial({ color: hex });
          this._spawnIndividual(grid, x, y, z, flatIdx, mat);
        } else {
          this._removeIndividual(flatIdx);
        }
        break;

      case CellState.MISSING:
      case CellState.DAMAGED:
        if (this._showMissingOutlines) {
          this._spawnIndividual(grid, x, y, z, flatIdx, missingMaterial, true);
        } else {
          this._removeIndividual(flatIdx);
        }
        break;

      case CellState.FLOODED:
        this._spawnIndividual(grid, x, y, z, flatIdx, floodedMaterial);
        break;
    }

    return instanceDirty;
  }

  /**
   * Remove an individual overlay mesh. BOX_GEO/EDGES_GEO are module-level and
   * shared by every ChunkRenderer instance — they must never be disposed here.
   */
  _disposeIndividualMesh(mesh) {
    this.container.remove(mesh);
    if (mesh.geometry !== BOX_GEO && mesh.geometry !== EDGES_GEO && mesh.geometry !== OUTLINE_BOX_GEO) {
      mesh.geometry.dispose();
    }
  }

  _spawnIndividual(grid, x, y, z, flatIdx, material, isOutline = false) {
    if (this._individualMeshes.has(flatIdx)) {
      const existing = this._individualMeshes.get(flatIdx);
      if ((existing.type === 'LineSegments') !== isOutline) {
        // Different object type; recreate it
        this._removeIndividual(flatIdx);
      } else {
        existing.material = material;
        return;
      }
    }

    if (this._individualMeshes.size >= MAX_INDIVIDUAL_MESHES) {
      const evictIdx = this._individualQueue.shift();
      if (evictIdx !== undefined) this._removeIndividual(evictIdx);
    }

    const obj = isOutline ? new THREE.LineSegments(EDGES_GEO, material) : new THREE.Mesh(BOX_GEO, material);
    obj.position.copy(grid.toWorldPos(x, y, z));
    if (isOutline) {
      obj.renderOrder = 999;
    }
    this.container.add(obj);

    this._individualMeshes.set(flatIdx, obj);
    this._individualQueue.push(flatIdx);
  }

  _removeIndividual(flatIdx) {
    const mesh = this._individualMeshes.get(flatIdx);
    if (!mesh) return;

    this.container.remove(mesh);
    this._individualMeshes.delete(flatIdx);

    const qIdx = this._individualQueue.indexOf(flatIdx);
    if (qIdx !== -1) this._individualQueue.splice(qIdx, 1);
  }
}
