build:
	tsup
	#tsup src/register.ts --env.DEV=false --minify
	rollup -c rollup.config.js
	mv dist/register.js dist/register.min.js
	echo "register gzip: $(cat dist/register.min.js | gzip | wc -c)"
	tsup src/register.ts --env.DEV=true

test:
	playwright test

dev:
	playwright test --ui

clean:
	rm -r dist
