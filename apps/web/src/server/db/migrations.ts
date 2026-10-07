export interface Migration {
  version: number;
  sql: string;
}

/** Append-only. Never edit a migration that has shipped; add a new one. */
export const MIGRATIONS: Migration[] = [
  {
    version: 1,
    sql: `
      CREATE TABLE scenarios (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        author_name TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'draft',
        origin TEXT NOT NULL DEFAULT 'original',
        version TEXT NOT NULL,
        allow_remix INTEGER NOT NULL DEFAULT 1,
        original_scenario_id TEXT,
        original_author TEXT,
        tag_index TEXT NOT NULL DEFAULT '',
        data TEXT NOT NULL,
        is_builtin INTEGER NOT NULL DEFAULT 0,
        is_own INTEGER NOT NULL DEFAULT 1,
        in_library INTEGER NOT NULL DEFAULT 0,
        favorite INTEGER NOT NULL DEFAULT 0,
        plays INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        published_at TEXT
      );
      CREATE INDEX scenarios_status_idx ON scenarios(status);

      CREATE TABLE scenario_snapshots (
        id TEXT PRIMARY KEY,
        scenario_id TEXT NOT NULL,
        version TEXT NOT NULL,
        data TEXT NOT NULL,
        created_at TEXT NOT NULL
      );

      CREATE TABLE stories (
        id TEXT PRIMARY KEY,
        scenario_id TEXT NOT NULL,
        snapshot_id TEXT NOT NULL REFERENCES scenario_snapshots(id),
        scenario_version TEXT NOT NULL,
        title TEXT NOT NULL,
        character_name TEXT NOT NULL,
        state TEXT NOT NULL,
        head_turn_id TEXT,
        last_illustrated_turn INTEGER NOT NULL DEFAULT -10,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE turns (
        id TEXT PRIMARY KEY,
        story_id TEXT NOT NULL REFERENCES stories(id) ON DELETE CASCADE,
        parent_id TEXT,
        number INTEGER NOT NULL,
        action TEXT,
        action_summary TEXT NOT NULL DEFAULT '',
        narrative TEXT NOT NULL,
        suggestions TEXT NOT NULL,
        report TEXT,
        state_after TEXT NOT NULL,
        ai TEXT,
        image_id TEXT,
        created_at TEXT NOT NULL
      );
      CREATE INDEX turns_story_idx ON turns(story_id);

      CREATE TABLE saves (
        id TEXT PRIMARY KEY,
        story_id TEXT NOT NULL REFERENCES stories(id) ON DELETE CASCADE,
        kind TEXT NOT NULL,
        slot INTEGER NOT NULL,
        label TEXT NOT NULL,
        turn_id TEXT NOT NULL,
        turn_number INTEGER NOT NULL,
        scenario_version TEXT NOT NULL,
        state TEXT NOT NULL,
        ai_meta TEXT,
        created_at TEXT NOT NULL
      );

      CREATE TABLE images (
        id TEXT PRIMARY KEY,
        story_id TEXT REFERENCES stories(id) ON DELETE CASCADE,
        scenario_id TEXT,
        kind TEXT NOT NULL,
        prompt TEXT NOT NULL,
        data_uri TEXT NOT NULL,
        provider TEXT NOT NULL,
        created_at TEXT NOT NULL
      );

      CREATE TABLE settings (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      );
    `,
  },
];
