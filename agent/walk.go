package main

import (
	"fmt"
	"io"
	"io/fs"
	"os"
	"strings"
)

const maxFileSize = 50 << 20 // 50 MB

// skipDirNames are never descended into (compared case-insensitively).
var skipDirNames = map[string]bool{
	".git":                      true,
	"$recycle.bin":              true,
	"system volume information": true,
	"temp":                      true,
	"tmp":                       true,
	".trash":                    true,
	"appdata":                   true,
	".cache":                    true,
}

// isPlainDir reports whether info is a real directory that is safe to enter:
// not a symlink, and not a junction / mount point (Go reports those as ModeIrregular on Windows).
func isPlainDir(info fs.FileInfo) bool {
	m := info.Mode()
	if m&(fs.ModeSymlink|fs.ModeIrregular) != 0 {
		return false
	}
	return m.IsDir()
}

// isPlainFile reports whether info is a regular file (not a link) no larger than maxFileSize.
func isPlainFile(info fs.FileInfo) bool {
	return info.Mode().IsRegular() && info.Size() <= maxFileSize
}

// lstatDir returns true if path exists and is a plain directory.
func lstatDir(path string) bool {
	info, err := os.Lstat(path)
	return err == nil && isPlainDir(info)
}

// readFileLimited reads a regular, non-link file of at most maxFileSize bytes.
func readFileLimited(path string) ([]byte, error) {
	info, err := os.Lstat(path)
	if err != nil {
		return nil, err
	}
	if !isPlainFile(info) {
		return nil, fmt.Errorf("%s: not a regular file or larger than 50 MB", path)
	}
	f, err := os.Open(path)
	if err != nil {
		return nil, err
	}
	defer f.Close()
	return io.ReadAll(io.LimitReader(f, maxFileSize+1))
}

// plainSubdirs lists the plain (non-link) subdirectories of dir.
func plainSubdirs(dir string) []string {
	entries, err := os.ReadDir(dir)
	if err != nil {
		return nil
	}
	var out []string
	for _, e := range entries {
		// Cheap pre-filter from the directory listing, then confirm with Lstat.
		if e.Type()&(fs.ModeSymlink|fs.ModeIrregular) != 0 || !e.IsDir() {
			continue
		}
		info, err := e.Info() // Lstat semantics
		if err != nil || !isPlainDir(info) {
			continue
		}
		out = append(out, e.Name())
	}
	return out
}

func shouldSkipDir(name string) bool {
	return skipDirNames[strings.ToLower(name)]
}
