build:
	tsup
	tsup src/register.ts --env.DEV=false --minify
	echo "register gzip: $(cat dist/register.js | gzip | wc -c)"
	tsc

test:
	playwright test

dev:
	playwright test --ui

clean:
	rm -r dist
