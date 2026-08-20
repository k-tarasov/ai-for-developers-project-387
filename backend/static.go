package main

import (
	"net/http"
	"net/url"
	"os"
	"path/filepath"
	"strings"
)

// buildDir возвращает путь к папке build рядом с исполняемым файлом.
func buildDir() string {
	exe, err := os.Executable()
	if err != nil {
		return "build"
	}
	return filepath.Join(filepath.Dir(exe), "build")
}

// spaHandler раздаёт статические файлы из dir. Для путей, которым
// не соответствует файл, отдаёт index.html (клиентский роутинг SPA).
// Пути внутри apiPrefix не обрабатываются: неизвестные API-маршруты
// должны отвечать 404, а не страницей SPA.
func spaHandler(dir string, apiPrefix string) http.HandlerFunc {
	fs := http.Dir(dir)
	fileServer := http.FileServer(fs)
	return func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path == apiPrefix || strings.HasPrefix(r.URL.Path, apiPrefix+"/") {
			http.NotFound(w, r)
			return
		}
		if f, err := fs.Open(r.URL.Path); err == nil {
			stat, statErr := f.Stat()
			f.Close()
			if statErr == nil && !stat.IsDir() {
				fileServer.ServeHTTP(w, r)
				return
			}
		}

		// Фолбэк на index.html для клиентских маршрутов.
		r2 := new(http.Request)
		*r2 = *r
		r2.URL = new(url.URL)
		*r2.URL = *r.URL
		r2.URL.Path = "/"
		fileServer.ServeHTTP(w, r2)
	}
}
