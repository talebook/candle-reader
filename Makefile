# 每次构建生成一个时间戳版本号，盖到 dist/demo.html 的静态资源引用上做缓存刷新
VERSION := $(shell date +%Y%m%d%H%M%S)

all:
	npm run build
	sed -E 's#(/style\.css)(\?v=[0-9]+)?#\1?v=$(VERSION)#; s#(/candle-reader\.es\.js)(\?v=[0-9]+)?#\1?v=$(VERSION)#' dist/demo.html > dist/demo.html.tmp && mv dist/demo.html.tmp dist/demo.html
	@echo "demo.html 资源已打版本号: ?v=$(VERSION)"

sync: all
	rsync -rv dist/ sz:~/Q/

install:
	 rm ~/code/talebook/app/public/static/candle-reader/ -rf
	 cp dist/ ~/code/talebook/app/public/static/candle-reader/ -rv
	 cp dist/talebook-template.html ~/code/talebook/webserver/resources/book/talebook-template.html

dev:
	p=public/demo/book1 && if [ ! -d "$$p" ] ; then mkdir -p "$$p"; unzip -o "$$p.epub" -d "$$p"; fi
	p=public/demo/book3 && if [ ! -d "$$p" ] ; then mkdir -p "$$p"; unzip -o "$$p.epub" -d "$$p"; fi
	npm run dev
