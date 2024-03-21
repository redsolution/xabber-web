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

httpsserver:
	./node_modules/http-server/bin/http-server -S -p 8001

minify: npm-ready
	npm run-script build

watch: npm-ready
	npm run-script watch

release: npm-ready
	./bash/release.sh
