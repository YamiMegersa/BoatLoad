/**
 * CommunityClient.js — Client interface for the BoatLoad Community UGC Platform.
 * Supports:
 * - Progressive Hybrid Auth (Anonymous guest credentials upgradeable to OAuth)
 * - Fetching curated courses (Trending, Recent, Hall of Fame, Code Search)
 * - Mario Maker telemetry (Clear rates, attempts, world records, stars)
 * - Publishing verified levels (enforces Clear Check proof)
 * - Seamless Local Mock Fallback when Supabase credentials are not yet configured.
 */

import { CrockfordBase32 } from './CrockfordBase32.js';
import { LevelSerializer } from './LevelSerializer.js';
import { ClearCheckManager } from './ClearCheckManager.js';
import { emit } from '../core/EventBus.js';

const LOCAL_STORAGE_COURSES = 'boatload_community_courses_v1';
const LOCAL_STORAGE_USER = 'boatload_community_user_v1';

export class CommunityClient {
  static _user = null;
  static _coursesCache = null;

  /**
   * Initializes or restores the local creator profile.
   */
  static getProfile() {
    if (this._user) return this._user;

    try {
      if (typeof localStorage !== 'undefined') {
        const raw = localStorage.getItem(LOCAL_STORAGE_USER);
        if (raw) {
          this._user = JSON.parse(raw);
          return this._user;
        }
      }
    } catch {}

    const randomSuffix = Math.floor(1000 + Math.random() * 9000);
    this._user = {
      id: 'guest_' + Math.random().toString(36).substring(2, 10),
      username: `Sailor #${randomSuffix}`,
      isAnonymous: true,
      makerScore: 0,
      uploadQuota: 10,
      uploadedCourseCodes: [],
      starredCourseCodes: [],
      clearedCourseCodes: []
    };
    this._persistUser();
    return this._user;
  }

  static updateUsername(newUsername) {
    const user = this.getProfile();
    const clean = (newUsername || '').trim().substring(0, 24);
    if (clean.length >= 3) {
      user.username = clean;
      this._persistUser();
      emit('communityProfileUpdated', user);
    }
    return user;
  }

  static get _supabaseConfig() {
    try {
      const url = (typeof import.meta !== 'undefined' && import.meta.env?.VITE_SUPABASE_URL) || 
                  (typeof window !== 'undefined' && window.SUPABASE_CONFIG?.url) || '';
      const key = (typeof import.meta !== 'undefined' && import.meta.env?.VITE_SUPABASE_ANON_KEY) || 
                  (typeof window !== 'undefined' && window.SUPABASE_CONFIG?.anonKey) || '';
      if (url && key && url.startsWith('http')) {
        return { url: url.replace(/\/$/, ''), key };
      }
    } catch {}
    return null;
  }

  static async _supabaseRequest(endpoint, { method = 'GET', body = null, headers = {} } = {}) {
    const cfg = this._supabaseConfig;
    if (!cfg) throw new Error('Supabase not configured');
    const res = await fetch(`${cfg.url}${endpoint}`, {
      method,
      headers: {
        'apikey': cfg.key,
        'Authorization': `Bearer ${cfg.key}`,
        'Content-Type': 'application/json',
        ...headers
      },
      body: body ? JSON.stringify(body) : undefined
    });
    if (!res.ok) {
      const errText = await res.text().catch(() => '');
      throw new Error(`Supabase request failed [${res.status}]: ${errText}`);
    }
    return res.status === 204 ? null : await res.json();
  }

  static async _uploadPayloadToStorage(storagePath, jsonString) {
    const cfg = this._supabaseConfig;
    const res = await fetch(`${cfg.url}/storage/v1/object/level-payloads/${storagePath}`, {
      method: 'POST',
      headers: {
        'apikey': cfg.key,
        'Authorization': `Bearer ${cfg.key}`,
        'Content-Type': 'application/json',
        'x-upsert': 'true'
      },
      body: jsonString
    });
    if (!res.ok) {
      const errText = await res.text().catch(() => '');
      throw new Error(`Storage upload failed [${res.status}]: ${errText}`);
    }
  }

  static async _fetchPayloadFromStorage(storagePath) {
    const cfg = this._supabaseConfig;
    const res = await fetch(`${cfg.url}/storage/v1/object/public/level-payloads/${storagePath}`);
    if (!res.ok) throw new Error(`Could not fetch course payload from storage [${res.status}]`);
    return await res.json();
  }

  static _mapRowToCourse(row) {
    if (!row) return null;
    const attempts = row.attempt_count || 1;
    const clears = row.clear_count || 0;
    const clearRate = Math.round((clears / attempts) * 1000) / 10;
    return {
      id: row.id,
      courseCode: row.course_code,
      authorId: row.author_id,
      authorName: row.author_name || 'Anonymous Shipwright',
      title: row.title,
      description: row.description || '',
      tags: row.tags || [],
      shipType: row.ship_type || 'sloop',
      weather: row.weather || 'sunny',
      difficulty: row.difficulty || 'normal',
      playCount: row.play_count || 0,
      attemptCount: attempts,
      clearCount: clears,
      clearRate,
      starCount: row.star_count || 0,
      worldRecord: row.world_record_time_ms ? {
        timeMs: row.world_record_time_ms,
        username: row.world_record_username || 'Unknown'
      } : null,
      firstClear: row.first_clear_username || null,
      clearCheckTimeMs: row.clear_check_time_ms,
      storagePath: row.storage_path,
      payloadHash: row.payload_hash,
      sizeBytes: row.payload_size_bytes,
      createdAt: row.created_at,
      levelData: null
    };
  }

  /**
   * Fetches community courses with sorting and search filters.
   * @param {object} options - { tab: 'trending'|'recent'|'expert'|'easy', searchCode: string }
   * @returns {Promise<Array<object>>}
   */
  static async getCourses({ tab = 'trending', searchCode = '' } = {}) {
    const cfg = this._supabaseConfig;

    // Production Cloud Supabase Query
    if (cfg) {
      try {
        let endpoint = `/rest/v1/levels?select=*&is_public=eq.true`;
        if (searchCode) {
          const norm = CrockfordBase32.normalize(searchCode);
          if (!norm) return [];
          endpoint += `&course_code=eq.${norm}`;
        } else if (tab === 'trending') {
          endpoint += `&order=star_count.desc,created_at.desc&limit=50`;
        } else if (tab === 'recent') {
          endpoint += `&order=created_at.desc&limit=50`;
        } else if (tab === 'expert') {
          endpoint += `&difficulty=in.(expert,super_expert)&order=star_count.desc&limit=50`;
        } else if (tab === 'easy') {
          endpoint += `&difficulty=in.(casual,normal)&order=star_count.desc&limit=50`;
        }
        const rows = await this._supabaseRequest(endpoint);
        return (rows || []).map(r => this._mapRowToCourse(r));
      } catch (err) {
        console.warn('Supabase getCourses failed, falling back to local cache', err);
      }
    }

    // Local / Offline fallback
    const all = await this._loadAllCourses();

    if (searchCode) {
      const norm = CrockfordBase32.normalize(searchCode);
      if (!norm) return [];
      return all.filter(c => c.courseCode === norm);
    }

    const list = [...all];

    if (tab === 'trending') {
      const now = Date.now();
      list.sort((a, b) => {
        const scoreA = (a.starCount * 5) + a.playCount - ((now - new Date(a.createdAt).getTime()) / 3600000 * 0.2);
        const scoreB = (b.starCount * 5) + b.playCount - ((now - new Date(b.createdAt).getTime()) / 3600000 * 0.2);
        return scoreB - scoreA;
      });
    } else if (tab === 'recent') {
      list.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    } else if (tab === 'expert') {
      list.sort((a, b) => (a.clearRate || 0) - (b.clearRate || 0));
    } else if (tab === 'easy') {
      list.sort((a, b) => (b.clearRate || 0) - (a.clearRate || 0));
    }

    return list;
  }

  /**
   * Retrieves a single course by its course code.
   */
  static async getCourse(courseCode) {
    const norm = CrockfordBase32.normalize(courseCode);
    if (!norm) return null;

    const cfg = this._supabaseConfig;
    if (cfg) {
      try {
        const rows = await this._supabaseRequest(`/rest/v1/levels?course_code=eq.${norm}&select=*`);
        if (rows && rows.length > 0) {
          const course = this._mapRowToCourse(rows[0]);
          if (!course.levelData && course.storagePath) {
            try {
              const payload = await this._fetchPayloadFromStorage(course.storagePath);
              course.levelData = payload.levelData || payload;
            } catch (storageErr) {
              console.warn('Could not load payload from object storage', storageErr);
            }
          }
          return course;
        }
      } catch (err) {
        console.warn('Supabase getCourse failed, checking local cache', err);
      }
    }

    const courses = await this._loadAllCourses();
    return courses.find(c => c.courseCode === norm) || null;
  }

  /**
   * Publishes a level to the community platform.
   * Requires a verified Clear Check proof matching the level payload.
   */
  static async publishCourse(levelCfg, metadata = {}) {
    const user = this.getProfile();

    if (user.uploadedCourseCodes.length >= user.uploadQuota) {
      throw new Error(`Upload quota reached (${user.uploadQuota} courses). Earn more stars from other players to unlock slots!`);
    }

    // 1. Serialize & Validate
    const { payload, checksum, jsonString, sizeBytes } = await LevelSerializer.serialize(levelCfg, {
      ...metadata,
      authorName: user.username
    });

    // 2. Enforce Clear Check verification
    const { isVerified, proof } = await ClearCheckManager.hasValidClearProof(levelCfg);
    if (!isVerified || !proof) {
      throw new Error('Mario Maker Rule: You must test and clear this course from dock to harbor before publishing!');
    }

    // 3. Generate unique Course Code
    const courseCode = CrockfordBase32.generateCourseCode();
    const storagePath = `levels/${courseCode}.json`;

    const courseEntry = {
      courseCode,
      authorId: user.id,
      authorName: user.username,
      title: payload.metadata.title,
      description: payload.metadata.description,
      tags: payload.metadata.tags,
      shipType: payload.levelData.ship || 'sloop',
      weather: payload.levelData.weather || (payload.levelData.isStormy ? 'stormy' : 'sunny'),
      difficulty: 'normal',
      playCount: 1,
      attemptCount: 1,
      clearCount: 1,
      clearRate: 100.0,
      starCount: 0,
      worldRecord: {
        timeMs: proof.clearTimeMs,
        username: user.username
      },
      firstClear: user.username,
      clearCheckTimeMs: proof.clearTimeMs,
      storagePath,
      payloadHash: checksum,
      sizeBytes,
      createdAt: new Date().toISOString(),
      levelData: payload.levelData
    };

    // 4. Cloud Upload to Supabase Storage & Database if configured
    const cfg = this._supabaseConfig;
    if (cfg) {
      try {
        // Upload payload to S3-compatible Object Storage
        await this._uploadPayloadToStorage(storagePath, jsonString);

        // Insert metadata row into PostgreSQL
        await this._supabaseRequest('/rest/v1/levels', {
          method: 'POST',
          headers: { 'Prefer': 'return=representation' },
          body: {
            course_code: courseCode,
            author_id: user.isAnonymous ? null : (user.id.startsWith('guest_') ? null : user.id),
            author_name: user.username,
            title: courseEntry.title,
            description: courseEntry.description,
            tags: courseEntry.tags,
            ship_type: courseEntry.shipType,
            weather: courseEntry.weather,
            difficulty: courseEntry.difficulty,
            storage_path: storagePath,
            payload_hash: checksum,
            payload_size_bytes: sizeBytes,
            clear_check_time_ms: proof.clearTimeMs,
            world_record_time_ms: proof.clearTimeMs,
            world_record_username: user.username,
            first_clear_username: user.username,
            play_count: 1,
            attempt_count: 1,
            clear_count: 1,
            star_count: 0
          }
        });
      } catch (cloudErr) {
        console.error('Failed to publish to Supabase cloud, falling back to local persistence', cloudErr);
      }
    }

    // Store in local catalog
    const all = await this._loadAllCourses();
    all.unshift(courseEntry);
    this._coursesCache = all;
    this._persistCourses(all);

    user.uploadedCourseCodes.push(courseCode);
    this._persistUser();

    emit('communityCoursePublished', courseEntry);
    return courseEntry;
  }

  /**
   * Records a voyage attempt outcome on a course.
   */
  static async recordAttempt(courseCode, { cleared = false, timeMs = 0, deathPos = null } = {}) {
    const course = await this.getCourse(courseCode);
    if (!course) return;

    course.attemptCount = (course.attemptCount || 0) + 1;
    if (cleared) {
      course.clearCount = (course.clearCount || 0) + 1;
      
      // World Record evaluation
      if (!course.worldRecord || (timeMs > 0 && timeMs < course.worldRecord.timeMs)) {
        course.worldRecord = {
          timeMs,
          username: this.getProfile().username
        };
      }
    }

    course.clearRate = Math.round((course.clearCount / course.attemptCount) * 1000) / 10;
    
    // Auto-update difficulty tag
    if (course.clearRate < 5) course.difficulty = 'super_expert';
    else if (course.clearRate < 20) course.difficulty = 'expert';
    else if (course.clearRate < 60) course.difficulty = 'normal';
    else course.difficulty = 'casual';

    const all = await this._loadAllCourses();
    const idx = all.findIndex(c => c.courseCode === course.courseCode);
    if (idx !== -1) {
      all[idx] = course;
      this._persistCourses(all);
    }

    // Cloud update via RPC
    const cfg = this._supabaseConfig;
    if (cfg) {
      this._supabaseRequest('/rest/v1/rpc/record_course_attempt', {
        method: 'POST',
        body: {
          p_course_code: courseCode,
          p_cleared: cleared,
          p_time_ms: timeMs || 0,
          p_player_name: this.getProfile().username
        }
      }).catch(err => console.warn('Supabase recordAttempt RPC error', err));

      if (deathPos && typeof deathPos.x === 'number') {
        this._supabaseRequest('/rest/v1/level_deaths', {
          method: 'POST',
          body: {
            level_id: course.id || null,
            pos_x: deathPos.x,
            pos_z: deathPos.z
          }
        }).catch(err => console.warn('Supabase death logging error', err));
      }
    }

    emit('communityCourseUpdated', course);
  }

  /**
   * Toggles a Star / Like on a course.
   */
  static async toggleStar(courseCode) {
    const user = this.getProfile();
    const course = await this.getCourse(courseCode);
    if (!course) return false;

    const alreadyStarred = user.starredCourseCodes.includes(courseCode);
    if (alreadyStarred) {
      user.starredCourseCodes = user.starredCourseCodes.filter(c => c !== courseCode);
      course.starCount = Math.max(0, (course.starCount || 0) - 1);
    } else {
      user.starredCourseCodes.push(courseCode);
      course.starCount = (course.starCount || 0) + 1;
    }

    const all = await this._loadAllCourses();
    const idx = all.findIndex(c => c.courseCode === course.courseCode);
    if (idx !== -1) {
      all[idx] = course;
      this._persistCourses(all);
    }
    this._persistUser();

    // Cloud update via RPC
    const cfg = this._supabaseConfig;
    if (cfg) {
      this._supabaseRequest('/rest/v1/rpc/toggle_course_star', {
        method: 'POST',
        body: {
          p_course_code: courseCode,
          p_increment: alreadyStarred ? -1 : 1
        }
      }).catch(err => console.warn('Supabase toggleStar RPC error', err));
    }

    emit('communityCourseUpdated', course);
    return !alreadyStarred;
  }

  // -------------------------------------------------------------------------
  // Storage & Seeds
  // -------------------------------------------------------------------------

  static async _loadAllCourses() {
    if (this._coursesCache) return this._coursesCache;

    try {
      if (typeof localStorage !== 'undefined') {
        const raw = localStorage.getItem(LOCAL_STORAGE_COURSES);
        if (raw) {
          this._coursesCache = JSON.parse(raw);
          return this._coursesCache;
        }
      }
    } catch {}

    // Seed realistic starter courses for immediate exploration
    const seed = this._getSeedCourses();
    this._coursesCache = seed;
    this._persistCourses(seed);
    return this._coursesCache;
  }

  static _persistCourses(courses) {
    try {
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem(LOCAL_STORAGE_COURSES, JSON.stringify(courses));
      }
    } catch (e) {
      console.warn('Could not persist community courses', e);
    }
  }

  static _persistUser() {
    try {
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem(LOCAL_STORAGE_USER, JSON.stringify(this._user));
      }
    } catch (e) {
      console.warn('Could not persist community user', e);
    }
  }

  static _getSeedCourses() {
    return [
      {
        courseCode: 'BL-7K2-MN9',
        authorName: 'Admiral Drake',
        title: "Kraken's Jagged Maw",
        description: "Thread through the siren reef before the tentacle rush cuts you off! High speed navigation required.",
        tags: ['speedrun', 'boss', 'hazard'],
        shipType: 'sloop',
        weather: 'stormy',
        difficulty: 'expert',
        playCount: 1420,
        attemptCount: 3840,
        clearCount: 520,
        clearRate: 13.5,
        starCount: 284,
        worldRecord: { timeMs: 38240, username: 'SpeedySailor' },
        firstClear: 'Blackbeard',
        clearCheckTimeMs: 44100,
        createdAt: new Date(Date.now() - 86400000 * 2).toISOString(),
        levelData: null // loads standard Day 3-style terrain
      },
      {
        courseCode: 'BL-3P4-RT8',
        authorName: 'Corsair Kate',
        title: 'Archipelago Slalom',
        description: 'A smooth, scenic slalom between towering stone pillars with gentle tailwinds and barrel jumps.',
        tags: ['casual', 'scenic', 'beginner'],
        shipType: 'sloop',
        weather: 'sunny',
        difficulty: 'casual',
        playCount: 2180,
        attemptCount: 2540,
        clearCount: 1980,
        clearRate: 77.9,
        starCount: 412,
        worldRecord: { timeMs: 29150, username: 'WindRider' },
        firstClear: 'CabinBoy',
        clearCheckTimeMs: 31200,
        createdAt: new Date(Date.now() - 86400000 * 5).toISOString(),
        levelData: null
      },
      {
        courseCode: 'BL-9X1-KV2',
        authorName: 'Barnaby Ghost',
        title: "Siren's Whispering Fog",
        description: 'Dense golden mist conceals submerged pinnacles. Rely on the sound of church bells to stay off the rocks.',
        tags: ['puzzle', 'fog', 'precision'],
        shipType: 'sloop',
        weather: 'foggy',
        difficulty: 'normal',
        playCount: 980,
        attemptCount: 1820,
        clearCount: 610,
        clearRate: 33.5,
        starCount: 178,
        worldRecord: { timeMs: 48900, username: 'GhostNavigator' },
        firstClear: 'NavigatorPip',
        clearCheckTimeMs: 51200,
        createdAt: new Date(Date.now() - 86400000).toISOString(),
        levelData: null
      }
    ];
  }
}
