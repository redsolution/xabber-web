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
	./node_modules/.bin/cleancss -o dist/xabber.min.css css/materialdesignicons.css css/quill.snow.css node_modules/perfect-scrollbar/dist/css/perfect-scrollbar.css node_modules/magnific-popup/dist/magnific-popup.css css/plyr.css css/materialize.css css/color-scheme.css css/xabber.css
	npm run-script build

release: npm-ready
	./bash/release.sh
