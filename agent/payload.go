package main

// Result is what `scan` writes to <datadir>/latest.json and what the UI reads.
type Result struct {
	Machine      Machine   `json:"machine"`
	AgentVersion string    `json:"agent_version"`
	ScannedAt    string    `json:"scanned_at"`
	Roots        []string  `json:"roots"`
	Packages     []Package `json:"packages"`
}

type Machine struct {
	Hostname string `json:"hostname"`
	OS       string `json:"os"`
	Arch     string `json:"arch"`
	Username string `json:"username"`
}

type Package struct {
	Ecosystem   string `json:"ecosystem"`
	Name        string `json:"name"`
	Version     string `json:"version"`
	Scope       string `json:"scope"` // "global" | "project"
	ProjectRoot string `json:"project_root"`
	SourceFile  string `json:"source_file"`
	// Direct is true when the lockfile lists the package as a direct dependency of the project.
	Direct      bool   `json:"direct,omitempty"`
	Description string `json:"description,omitempty"`
	License     string `json:"license,omitempty"`
	Author      string `json:"author,omitempty"`
	Homepage    string `json:"homepage,omitempty"`
	Repository  string `json:"repository,omitempty"`
	// InstallScripts holds preinstall/install/postinstall commands from package.json (text only, never run).
	InstallScripts map[string]string `json:"install_scripts,omitempty"`
	// HasInstallScript is set from the lockfile (v2/v3) even when node_modules is not present.
	HasInstallScript bool `json:"has_install_script,omitempty"`
}
