// Command pkgscan inventories npm and pnpm packages on this machine by reading lockfiles and
// package.json manifests only. It never starts external processes.
//
// npm and pnpm are kept completely separate: each scan covers one package manager and is
// saved to its own file (latest-npm.json / latest-pnpm.json).
package main

import (
	"encoding/json"
	"flag"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"text/tabwriter"
)

var version = "0.1.0" // overridden by -ldflags "-X main.version=..."

const usage = `pkgscan - kiểm kê package npm / pnpm trên máy này

Cách dùng:
  pkgscan scan [--manager npm|pnpm]            Quét và lưu kết quả (mặc định: cả hai, mỗi loại một file)
  pkgscan scan --manager npm|pnpm --dry-run    Quét và in JSON ra màn hình, không lưu
  pkgscan find <tên> [--version <phiên bản>] [--manager npm|pnpm]
                                               Tìm package trong kết quả quét gần nhất
  pkgscan version
`

func main() {
	if len(os.Args) < 2 {
		fmt.Fprint(os.Stderr, usage)
		os.Exit(2)
	}
	var err error
	switch os.Args[1] {
	case "scan":
		err = cmdScan(os.Args[2:])
	case "find":
		err = cmdFind(os.Args[2:])
	case "version":
		fmt.Println(version)
	default:
		fmt.Fprint(os.Stderr, usage)
		os.Exit(2)
	}
	if err != nil {
		fmt.Fprintln(os.Stderr, "lỗi:", err)
		os.Exit(1)
	}
}

// modesFrom turns the --manager flag into the list of package managers to handle.
func modesFrom(flagValue string) ([]Mode, error) {
	if flagValue == "" {
		return []Mode{ModeNPM, ModePNPM}, nil
	}
	m, ok := parseMode(flagValue)
	if !ok {
		return nil, fmt.Errorf("--manager phải là npm hoặc pnpm")
	}
	return []Mode{m}, nil
}

func cmdScan(args []string) error {
	fs := flag.NewFlagSet("scan", flag.ContinueOnError)
	dry := fs.Bool("dry-run", false, "in JSON ra stdout, không lưu")
	manager := fs.String("manager", "", "npm hoặc pnpm (mặc định: cả hai)")
	if err := fs.Parse(args); err != nil {
		return err
	}
	modes, err := modesFrom(*manager)
	if err != nil {
		return err
	}
	if *dry && len(modes) != 1 {
		return fmt.Errorf("--dry-run cần --manager npm hoặc --manager pnpm")
	}
	cfg, err := loadConfig()
	if err != nil {
		return fmt.Errorf("đọc cấu hình: %w", err)
	}
	for _, m := range modes {
		res := runScan(cfg, m)
		if *dry {
			enc := json.NewEncoder(os.Stdout)
			enc.SetIndent("", "  ")
			return enc.Encode(res)
		}
		path, err := saveResult(res, m)
		if err != nil {
			return err
		}
		fmt.Printf("[%s] Đã quét %d package. Kết quả: %s\n", m, len(res.Packages), path)
	}
	return nil
}

func cmdFind(args []string) error {
	// Allow the name before or after flags.
	var name string
	if len(args) > 0 && !strings.HasPrefix(args[0], "-") {
		name, args = args[0], args[1:]
	}
	fs := flag.NewFlagSet("find", flag.ContinueOnError)
	ver := fs.String("version", "", "chỉ hiện phiên bản này")
	manager := fs.String("manager", "", "npm hoặc pnpm (mặc định: cả hai)")
	if err := fs.Parse(args); err != nil {
		return err
	}
	if name == "" {
		name = fs.Arg(0)
	}
	if name == "" {
		return fmt.Errorf("thiếu tên package")
	}
	modes, err := modesFrom(*manager)
	if err != nil {
		return err
	}
	w := tabwriter.NewWriter(os.Stdout, 0, 0, 2, ' ', 0)
	fmt.Fprintln(w, "LOẠI\tTÊN\tPHIÊN BẢN\tPHẠM VI\tDỰ ÁN")
	n, found := 0, 0
	for _, m := range modes {
		res, err := loadResult(m)
		if err != nil {
			continue
		}
		found++
		for _, p := range res.Packages {
			if !strings.EqualFold(p.Name, name) || (*ver != "" && p.Version != *ver) {
				continue
			}
			fmt.Fprintf(w, "%s\t%s\t%s\t%s\t%s\n", m, p.Name, p.Version, p.Scope, p.ProjectRoot)
			n++
		}
	}
	if found == 0 {
		return fmt.Errorf("chưa có kết quả quét, hãy chạy `pkgscan scan` trước")
	}
	w.Flush()
	fmt.Printf("\n%d kết quả\n", n)
	return nil
}

func resultPath(m Mode) (string, error) {
	d, err := dataDir()
	if err != nil {
		return "", err
	}
	return filepath.Join(d, "latest-"+string(m)+".json"), nil
}

// saveResult writes latest-<manager>.json atomically inside the agent's data dir.
func saveResult(res Result, m Mode) (string, error) {
	path, err := resultPath(m)
	if err != nil {
		return "", err
	}
	if err := os.MkdirAll(filepath.Dir(path), 0o700); err != nil {
		return "", err
	}
	data, err := json.Marshal(res)
	if err != nil {
		return "", err
	}
	tmp := path + ".tmp"
	if err := os.WriteFile(tmp, data, 0o600); err != nil {
		return "", err
	}
	return path, os.Rename(tmp, path)
}

func loadResult(m Mode) (Result, error) {
	var res Result
	path, err := resultPath(m)
	if err != nil {
		return res, err
	}
	data, err := os.ReadFile(path)
	if err != nil {
		return res, err
	}
	return res, json.Unmarshal(data, &res)
}
