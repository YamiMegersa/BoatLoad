# NPC Voice / Animalese Clips

Drop your short `.mp3` syllable/babble recordings in this directory (`src/assets/audio/voices/`).

- **Automatic discovery**: Any `.mp3` file placed inside `src/assets/audio/voices/` (including subfolders) is automatically bundled by Vite and loaded by `AudioManager.js`.
- **Per-character voices**: You can tune each customer's pitch, pitch variance, typewriter cadence (`charIntervalMs`), syllable step (`syllableStep`), or assign specific `.mp3` clip names via the `voice` object in `src/config/CustomerScript.js`.

