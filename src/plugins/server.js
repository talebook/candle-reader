const serverPlugin = {
    install: (app, options) => {

        const server = options.server;

        app.config.globalProperties.$alert = function (alert_type, alert_msg, alert_to) {
            app.$store.commit("alert", { type: alert_type, msg: alert_msg, to: alert_to });
            if (alert_type === 'success') {
                setTimeout(() => {
                    app.$store.commit('close_alert')
                }, 1300)
            }
        };

        // 注入 backend 方法
        app.config.globalProperties.$backend = async function (url, options) {
            if (url === undefined) {
                throw "url is undefined "
            }
            var args = {
                mode: "cors", redirect: "follow", credentials: 'include',
                timeout: 10000, // 添加超时设置
            }

            var full_url = server + url;

            if (options !== undefined) {
                Object.assign(args, options);
            }
            
            // 添加请求超时处理
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), args.timeout || 10000);
            
            return fetch(full_url, {
                ...args,
                signal: controller.signal
            })
                .then(rsp => {
                    clearTimeout(timeoutId);
                    var msg = "";
                    if (rsp.status === 413) {
                        msg = "服务器响应了413异常状态码。<br/>可能是上传的文件过大，超过了服务器设置的上传大小。";
                        app.$alert("error", msg);
                        throw msg;
                    }

                    else if (rsp.status === 502) {
                        msg = "服务器正在启动中...";
                        app.$alert("info", msg);
                        throw msg;
                    }

                    else if (rsp.status !== 200) {
                        msg = "服务器异常，状态码: " + rsp.status + "<br/>请查阅服务器日志:<br/>talebook.log";
                        app.$alert("error", msg);
                        throw msg;
                    }

                    try {
                        return rsp.json();
                    } catch (err) {
                        msg = "服务器异常，响应非JSON<br/>请查阅服务器日志:<br/>talebook.log";
                        app.$alert("error", msg);
                        throw msg;
                    }
                })
                .then(rsp => {
                    if (rsp.err === 'exception') {
                        // 检查 app.$store 是否存在，避免调用不存在的方法
                        if (app.$store) {
                            app.$store.commit("alert", { type: "error", msg: rsp.msg, to: null });
                        } else {
                            // 如果 store 不存在，使用 console.error 输出错误
                            console.error('API 异常:', rsp.msg);
                        }
                    }
                    return rsp;
                })
                .catch(err => {
                    clearTimeout(timeoutId);
                    var msg = "";
                    if (err.name === 'AbortError') {
                        msg = "请求超时，请检查网络连接或服务器状态";
                    } else if (!navigator.onLine) {
                        msg = "网络连接已断开，请检查网络设置";
                    } else {
                        msg = "请求失败: " + (err.message || "未知错误");
                    }
                    console.error('API请求失败:', err);
                    // 不显示错误提示，避免影响用户体验
                    // app.$alert("error", msg);
                    // 返回默认值，让应用能够继续运行
                    return { err: "network_error", msg: msg, data: {} };
                })
        };
    },
};

export default serverPlugin;
