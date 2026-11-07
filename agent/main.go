// Command pkgscan inventories npm packages on this machine by reading lockfiles and
// package.json manifests only. It never starts external processes.
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

const usage = `pkgscan - kiểm kê package npm trên máy này

Cách dùng:
  pkgscan scan              Quét và lưu kết quả vào thư mục dữ liệu
  pkgscan scan --dry-run    Quét và in JSON ra màn hình, không lưu
  pkgscan find <tên> [--version <phiên bản>]
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

func cmdScan(args []string) error {
	fs := flag.NewFlagSet("scan", flag.ContinueOnError)
	dry := fs.Bool("dry-run", false, "in JSON ra stdout, không lưu")
	if err := fs.Parse(args); err != nil {
		return err
	}
	cfg, err := loadConfig()
	if err != nil {
		return fmt.Errorf("đọc cấu hình: %w", err)
	}
	res := runScan(cfg)
	if *dry {
		enc := json.NewEncoder(os.Stdout)
		enc.SetIndent("", "  ")
		return enc.Encode(res)
	}
	path, err := saveResult(res)
	if err != nil {
		return err
	}
	fmt.Printf("Đã quét %d package. Kết quả: %s\n", len(res.Packages), path)
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
	if err := fs.Parse(args); err != nil {
		return err
	}
	if name == "" {
		name = fs.Arg(0)
	}
	if name == "" {
		return fmt.Errorf("thiếu tên package")
	}
	res, err := loadResult()
	if err != nil {
		return fmt.Errorf("chưa có kết quả quét, hãy chạy `pkgscan scan` trước (%w)", err)
	}
	w := tabwriter.NewWriter(os.Stdout, 0, 0, 2, ' ', 0)
	fmt.Fprintln(w, "TÊN\tPHIÊN BẢN\tPHẠM VI\tDỰ ÁN")
	n := 0
	for _, p := range res.Packages {
		if !strings.EqualFold(p.Name, name) || (*ver != "" && p.Version != *ver) {
			continue
		}
		fmt.Fprintf(w, "%s\t%s\t%s\t%s\n", p.Name, p.Version, p.Scope, p.ProjectRoot)
		n++
	}
	w.Flush()
	fmt.Printf("\n%d kết quả (lần quét %s)\n", n, res.ScannedAt)
	return nil
}

func resultPath() (string, error) {
	d, err := dataDir()
	if err != nil {
		return "", err
	}
	return filepath.Join(d, "latest.json"), nil
}

// saveResult writes latest.json atomically inside the agent's data dir.
func saveResult(res Result) (string, error) {
	path, err := resultPath()
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

func loadResult() (Result, error) {
	var res Result
	path, err := resultPath()
	if err != nil {
		return res, err
	}
	data, err := os.ReadFile(path)
	if err != nil {
		return res, err
	}
	return res, json.Unmarshal(data, &res)
}
