const serverPlugin = {
    install: (app) => {
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
            }
            var server = window.location.origin;
            server = "http://localhost:8080";

            var full_url = server + url;

            if (options !== undefined) {
                Object.assign(args, options);
            }
            return fetch(full_url, args)
                .then(rsp => {
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
                        app.$store.commit("alert", { type: "error", msg: rsp.msg, to: null });
                    }
                    return rsp;
                })
        };
    },
};

export default serverPlugin;