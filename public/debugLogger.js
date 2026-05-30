if (typeof window !== "undefined") {
  if(! window.error_handler_installed) {
    window.error_handler_logs = [];

    const shouldSuppressLog = (name, argsLike) => {
      if (name !== 'info') {
        return false;
      }

      const firstArg = argsLike?.[0];
      return typeof firstArg === 'string' && firstArg.includes('Created TensorFlow Lite XNNPACK delegate for CPU');
    };

    const handler = ((old) => ({
      get: (_, name) => {
        function passf() {
          old[name].apply(null, arguments);
        }

        function logf() {
          if (shouldSuppressLog(name, arguments)) {
            return;
          }

          const logEntry = {
            type: name,
            ts: +new Date(),
            arguments,
          };
          window.error_handler_logs.push(logEntry);

          const logsUrl = new URL(`${window.location.protocol}//${window.location.hostname}:${window.location.port}/api/dataHandler`);
          logsUrl.searchParams.append("type", "logs");
          const apiEnabled = localStorage.getItem("chatvrm_external_api_enabled");
          if (window.location.hostname === "localhost" && apiEnabled === "true") {
            fetch(logsUrl, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(logEntry),
            });
          }

          passf.apply(null, arguments);
        }

        switch (name) {
          case 'log':
          case 'debug':
          case 'info':
          case 'warn':
          case 'error':
            return logf;
          default:
            return passf;
        }
      }
    }))(window.console);
    window.console = new Proxy({}, handler);

    window.addEventListener("error", (e) => {
      console.error(`Error occurred: ${e.error.message} ${e.error.stack}`);
      return false;
    });

    window.addEventListener("unhandledrejection", (e) => {
      console.error(`Unhandled rejection: ${e.message}`);
      return false;
    });

    window.error_handler_installed = true;
  }
}
