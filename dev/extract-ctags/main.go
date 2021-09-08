// Program extract-ctags extracts a list of languages and filename extensions
// by parsing the output of the universal-ctags command-line tool.
//
// Basic usage:
//    go run extract-ctags.go -all
//
// Output is written to stdout and consists of a block of handler arguments in
// the style expected by languages.ts. The output should be correctly formatted
// but must be vetted by a human before checking it in.
package main

import (
	"errors"
	"flag"
	"fmt"
	"log"
	"os"
	"os/exec"
	"path/filepath"
	"regexp"
	"sort"
	"strings"
	"text/template"
)

// This block should express a LanguageSpec, see the languageSpecs const in
// languages.ts for the expected format of the output.
const templateSrc = `{
    languageID: {{quoted .ID}},
    stylized: {{quoted .Name}},
    fileExts: [{{range .Extensions}}
        {{quoted .}},{{end}}
    ],
    commentStyle: cStyle,
},
`

var (
	ctagsPath = flag.String("ctags", "", `Path of universal-ctags tool ("" uses $PATH)`)
	langFile  = flag.String("existing", "", "Path of existing languages file (.ts)")
	doAll     = flag.Bool("all", false, "Generate all available languages, modulo filter")

	filterBy = regexp.MustCompile(`stylized: +'(.*?)',?`)

	output = template.Must(template.New("lang").Funcs(template.FuncMap{
		"quoted": func(s string) string {
			return "'" + strings.ReplaceAll(s, "'", "\\'") + "'"
		},
	}).Parse(templateSrc))
)

func init() {
	flag.Usage = func() {
		fmt.Fprintf(os.Stderr, `Usage: %s [options] lang-name...

Extract language information from universal-ctags and print a skeletal
LanguageSpec value for each to stdout in the format consumed by languages.ts.

You must either specify language labels to extract, or -all to list all
available languages supported by the universal-ctags binary.

If -existing is specified, the tool scans that file for languages that appear
already to be implemented, and filters them from the output. This is useful
in conjunction with -all.

Options:
`, filepath.Base(os.Args[0]))
		flag.PrintDefaults()
	}
}

func main() {
	flag.Parse()
	if flag.NArg() == 0 && !*doAll {
		log.Fatal("You must specify languages to generate, or -all")
	}

	langs, err := listMapExtensions()
	if err != nil {
		log.Fatalf("Parsing language extensions: %v", err)
	}
	exists, err := knownLanguages(*langFile)
	if err != nil {
		log.Fatalf("Reading known languages: %v", err)
	}
	for _, lang := range langs {
		if !wantLang(lang.Name) {
			continue
		} else if exists[lang.Name] {
			log.Printf("Skipped existing language: %s", lang.Name)
			continue
		}
		if err := output.Execute(os.Stdout, lang); err != nil {
			log.Fatalf("Generating output for language %q: %v", lang.Name, err)
		}
	}
}

func wantLang(name string) bool {
	for _, lang := range flag.Args() {
		if lang == name {
			return true
		}
	}
	return *doAll
}

type langInfo struct {
	Name       string
	Extensions []string // ordered lexicographically
}

// Return the expected language ID for the specified language.
func (li langInfo) ID() string { return strings.ToLower(li.Name) }

// listMapExtensions returns an ordered, deduplicated slice of language file
// extension mappings, parsed from the output of the universal-ctags tool.
func listMapExtensions() ([]langInfo, error) {
	tool := *ctagsPath
	if tool == "" {
		tool = "universal-ctags"
	}
	out, err := exec.Command(tool, "--machinable", "--list-map-extensions").Output()
	if err != nil {
		// For process errors, report stderr so the user can tell if they pointed
		// to an invalid ctags binary, or if it's not installed.
		if e, ok := err.(*exec.ExitError); ok {
			err = errors.New(string(e.Stderr))
		}
		return nil, fmt.Errorf("running universal-ctags: %v", err)
	}

	// Eacn line of output is two tab-separated fields, language name and a bare
	// file extension ("go" rather than ".go").
	db := make(map[string]map[string]bool)
	lines := strings.Split(strings.TrimSpace(string(out)), "\n")
	for i, line := range lines {
		if strings.HasPrefix(line, "#") {
			continue // comment
		}
		fields := strings.Fields(line)
		if len(fields) != 2 {
			log.Printf("Warning: line %d is malformed (%q)", i+1, line)
			continue // ignore
		}

		lang, ext := fields[0], fields[1]
		if db[lang] == nil {
			db[lang] = map[string]bool{ext: true}
		} else {
			db[lang][ext] = true
		}
	}

	// Order languages by name, and extensions lexicographically.
	var result []langInfo
	for name, exts := range db {
		lang := langInfo{Name: name}
		for ext := range exts {
			lang.Extensions = append(lang.Extensions, ext)
		}
		sort.Strings(lang.Extensions)
		result = append(result, lang)
	}
	sort.Slice(result, func(i, j int) bool {
		return result[i].Name < result[j].Name
	})
	return result, nil
}

// knownLanguages lists the known languages from the specified implementation
// source. It returns nil without error if no file was specified.
func knownLanguages(path string) (map[string]bool, error) {
	if path == "" {
		return nil, nil // OK, don't filter
	}
	data, err := os.ReadFile(path)
	if err != nil {
		return nil, err
	}
	m := filterBy.FindAllStringSubmatch(string(data), -1)
	exists := make(map[string]bool)
	for _, match := range m {
		exists[match[1]] = true
	}
	return exists, nil
}
