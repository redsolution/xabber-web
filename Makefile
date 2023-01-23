.PHONY: deps-install deps-flush minify httpserver

npm-ready: package.json
	npm install
	touch npm-ready

deps-flush:
	rm -f npm-ready
	rm -rf node_modules

deps-install: npm-ready

httpserver: npm-ready
	./node_modules/.bin/http-server -p 8000

minify: npm-ready
	npm run-script build

release: npm-ready
	./bash/release.sh
