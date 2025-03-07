all:
	npm run build

install:
	 rm ~/code/talebook/app/public/static/candle-reader/ -rf
	 cp dist/ ~/code/talebook/app/public/static/candle-reader/ -rv
	 cp dist/epubjs.html ~/code/talebook/webserver/resources/book/epubjs.html
