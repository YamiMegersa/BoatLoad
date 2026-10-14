import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter.js';

/**
 * Exports a Three.js Object3D / Group to a .glb binary file and triggers browser download.
 *
 * @param {import('three').Object3D} object - The Three.js Object3D or Scene to export
 * @param {string} filename - Target file name (e.g. 'dock_stall.glb')
 * @param {object} [options] - Optional overrides for GLTFExporter
 * @returns {Promise<void>}
 */
export async function exportToGLB(object, filename = 'dock_stall.glb', options = {}) {
  if (!object) {
    throw new Error('exportToGLB: No Three.js Object3D provided to export.');
  }

  const exporter = new GLTFExporter();
  const exportOptions = {
    binary: true,
    onlyVisible: true,
    ...options
  };

  return new Promise((resolve, reject) => {
    exporter.parse(
      object,
      (gltf) => {
        try {
          const blob = new Blob([gltf], { type: 'application/octet-stream' });
          const url = URL.createObjectURL(blob);
          const link = document.createElement('a');
          link.href = url;
          link.download = filename.endsWith('.glb') ? filename : `${filename}.glb`;
          document.body.appendChild(link);
          link.click();
          document.body.removeChild(link);
          setTimeout(() => URL.revokeObjectURL(url), 1000);
          resolve();
        } catch (err) {
          reject(err);
        }
      },
      (err) => reject(err),
      exportOptions
    );
  });
}
