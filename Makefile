# 每次构建生成一个时间戳版本号，盖到 dist/demo.html 的静态资源引用上做缓存刷新
VERSION := $(shell date +%Y%m%d%H%M%S)

.PHONY: all dist sync install dev

# 打包阅读器，并生成可直接部署的纯内存演示页 dist/demo.html（西游记 + 内存版宿主，见 demo.html）与介绍页 dist/index.html
dist:
	npm run build
	mkdir -p dist/demo
	cp demo/memory-host.js public/demo/xi-you-ji.epub dist/demo/
	sed -e 's#\./src/main\.js#./candle-reader.es.js?v=$(VERSION)#' -e 's#<!-- demo:style -->#<link rel="stylesheet" href="./style.css?v=$(VERSION)">#' demo.html > dist/demo.html
	sed -e 's#__VERSION__#$(VERSION)#g' intro.html > dist/index.html
	@echo "已生成 dist/demo.html，资源版本号: ?v=$(VERSION)"

all: dist

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
