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
	./node_modules/.bin/cleancss -o dist/xabber.min.css css/materialdesignicons.css node_modules/perfect-scrollbar/dist/css/perfect-scrollbar.css node_modules/magnific-popup/dist/magnific-popup.css css/materialize.css css/color-scheme.css css/xabber.css
	./node_modules/.bin/r.js -o name=node_modules/requirejs/require.js mainConfigFile=config.js

release: npm-ready
	./bash/release.sh
