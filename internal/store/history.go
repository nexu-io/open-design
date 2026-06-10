// Package store 持久化层：SQLite 存储配置、执行历史、工件索引
package store

import (
	"database/sql"
	"encoding/json"
	"fmt"
	"time"

	_ "github.com/mattn/go-sqlite3"
	"github.com/nexu-io/open-design/packages/multi-agent-team/pkg/protocol"
)

// HistoryStore 执行历史存储
type HistoryStore struct {
	db *sql.DB
}

// ExecutionRecord 执行记录
type ExecutionRecord struct {
	ID        string
	TeamID    string
	Mode      string
	TaskDesc  string
	Status    string
	StartedAt time.Time
	EndedAt   *time.Time
	Duration  time.Duration
	Result    string // JSON
}

// NewHistoryStore 创建历史存储
func NewHistoryStore(dbPath string) (*HistoryStore, error) {
	db, err := sql.Open("sqlite3", dbPath+"?_journal_mode=WAL")
	if err != nil {
		return nil, fmt.Errorf("open database: %w", err)
	}

	s := &HistoryStore{db: db}
	if err := s.migrate(); err != nil {
		return nil, fmt.Errorf("migrate: %w", err)
	}

	return s, nil
}

func (s *HistoryStore) migrate() error {
	migrations := []string{
		`CREATE TABLE IF NOT EXISTS executions (
			id TEXT PRIMARY KEY,
			team_id TEXT NOT NULL,
			mode TEXT NOT NULL,
			task_desc TEXT,
			status TEXT NOT NULL,
			started_at DATETIME NOT NULL,
			ended_at DATETIME,
			duration_ms INTEGER,
			result JSON
		)`,
		`CREATE TABLE IF NOT EXISTS artifacts (
			id TEXT PRIMARY KEY,
			execution_id TEXT,
			name TEXT NOT NULL,
			type TEXT NOT NULL,
			path TEXT,
			size INTEGER,
			checksum TEXT,
			producer TEXT,
			created_at DATETIME NOT NULL,
			FOREIGN KEY (execution_id) REFERENCES executions(id)
		)`,
		`CREATE TABLE IF NOT EXISTS team_snapshots (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			team_name TEXT NOT NULL,
			config JSON NOT NULL,
			created_at DATETIME NOT NULL
		)`,
	}

	for _, m := range migrations {
		if _, err := s.db.Exec(m); err != nil {
			return fmt.Errorf("execute migration: %w", err)
		}
	}

	return nil
}

// SaveExecution 保存执行记录
func (s *HistoryStore) SaveExecution(rec *ExecutionRecord) error {
	resultJSON, _ := json.Marshal(rec.Result)
	_, err := s.db.Exec(
		`INSERT OR REPLACE INTO executions (id, team_id, mode, task_desc, status, started_at, ended_at, duration_ms, result)
		 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
		rec.ID, rec.TeamID, rec.Mode, rec.TaskDesc, rec.Status,
		rec.StartedAt, rec.EndedAt, rec.Duration.Milliseconds(), string(resultJSON),
	)
	return err
}

// GetExecution 获取执行记录
func (s *HistoryStore) GetExecution(id string) (*ExecutionRecord, error) {
	row := s.db.QueryRow(
		`SELECT id, team_id, mode, task_desc, status, started_at, ended_at, duration_ms, result
		 FROM executions WHERE id = ?`, id,
	)

	var rec ExecutionRecord
	var endedAt sql.NullTime
	var resultStr string

	err := row.Scan(&rec.ID, &rec.TeamID, &rec.Mode, &rec.TaskDesc, &rec.Status,
		&rec.StartedAt, &endedAt, &rec.Duration, &resultStr)
	if err != nil {
		return nil, err
	}

	if endedAt.Valid {
		rec.EndedAt = &endedAt.Time
	}
	rec.Result = resultStr

	return &rec, nil
}

// ListExecutions 列出执行记录
func (s *HistoryStore) ListExecutions(teamID string, limit int) ([]*ExecutionRecord, error) {
	if limit <= 0 {
		limit = 50
	}

	var rows *sql.Rows
	var err error

	if teamID != "" {
		rows, err = s.db.Query(
			`SELECT id, team_id, mode, task_desc, status, started_at, ended_at, duration_ms
			 FROM executions WHERE team_id = ? ORDER BY started_at DESC LIMIT ?`, teamID, limit,
		)
	} else {
		rows, err = s.db.Query(
			`SELECT id, team_id, mode, task_desc, status, started_at, ended_at, duration_ms
			 FROM executions ORDER BY started_at DESC LIMIT ?`, limit,
		)
	}
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var records []*ExecutionRecord
	for rows.Next() {
		var rec ExecutionRecord
		var endedAt sql.NullTime
		if err := rows.Scan(&rec.ID, &rec.TeamID, &rec.Mode, &rec.TaskDesc, &rec.Status,
			&rec.StartedAt, &endedAt, &rec.Duration); err != nil {
			return nil, err
		}
		if endedAt.Valid {
			rec.EndedAt = &endedAt.Time
		}
		records = append(records, &rec)
	}

	return records, nil
}

// SaveArtifact 保存工件索引
func (s *HistoryStore) SaveArtifact(a *protocol.Artifact, executionID string) error {
	_, err := s.db.Exec(
		`INSERT OR REPLACE INTO artifacts (id, execution_id, name, type, path, size, checksum, producer, created_at)
		 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
		a.ID, executionID, a.Name, a.Type, a.Path, a.Size, a.Checksum, a.Producer, a.CreatedAt,
	)
	return err
}

// ListArtifacts 列出工件
func (s *HistoryStore) ListArtifacts(executionID string) ([]*protocol.Artifact, error) {
	rows, err := s.db.Query(
		`SELECT id, name, type, path, size, checksum, producer, created_at
		 FROM artifacts WHERE execution_id = ? ORDER BY created_at`, executionID,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var artifacts []*protocol.Artifact
	for rows.Next() {
		var a protocol.Artifact
		if err := rows.Scan(&a.ID, &a.Name, &a.Type, &a.Path, &a.Size, &a.Checksum, &a.Producer, &a.CreatedAt); err != nil {
			return nil, err
		}
		artifacts = append(artifacts, &a)
	}

	return artifacts, nil
}

// SaveTeamSnapshot 保存团队配置快照
func (s *HistoryStore) SaveTeamSnapshot(teamName string, configJSON []byte) error {
	_, err := s.db.Exec(
		`INSERT INTO team_snapshots (team_name, config, created_at) VALUES (?, ?, ?)`,
		teamName, string(configJSON), time.Now(),
	)
	return err
}

// Close 关闭数据库
func (s *HistoryStore) Close() error {
	return s.db.Close()
}
