all:
	npm run build

install:
	 rm ~/code/talebook/app/public/static/candle-reader/ -rf
	 cp dist/ ~/code/talebook/app/public/static/candle-reader/ -rv
	 cp dist/epubjs.html ~/code/talebook/webserver/resources/book/epubjs.html

dev:
	p=public/demo/book1 && if [ ! -d "$$p" ] ; then mkdir -p "$$p"; unzip -o "$$p.epub" -d "$$p"; fi
	p=public/demo/book3 && if [ ! -d "$$p" ] ; then mkdir -p "$$p"; unzip -o "$$p.epub" -d "$$p"; fi
	npm run dev
