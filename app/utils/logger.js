import log from "loglevel";

const normalizeArgs = (args) => {
  if (!args || args.length === 0) {
    return { message: "", metadata: undefined };
  }

  const [first, ...rest] = args;
  let message = "";
  const metadataChunks = [];

  const pushError = (error) => {
    if (!error) {
      return;
    }

    metadataChunks.push({
      error: {
        name: error.name,
        message: error.message,
        stack: error.stack,
      },
    });
  };

  if (typeof first === "string") {
    message = first;
  } else if (first instanceof Error) {
    message = first.message;
    pushError(first);
  } else {
    try {
      message = JSON.stringify(first);
    } catch (serializationError) {
      message = String(first);
      metadataChunks.push({
        serializationError: serializationError.message,
      });
    }
  }

  rest.forEach((item) => {
    if (item instanceof Error) {
      pushError(item);
      return;
    }

    if (item && typeof item === "object") {
      metadataChunks.push(item);
      return;
    }

    if (item !== undefined) {
      metadataChunks.push({ value: item });
    }
  });

  const metadata =
    metadataChunks.length === 0
      ? undefined
      : metadataChunks.reduce((acc, chunk) => ({ ...acc, ...chunk }), {});

  return { message, metadata };
};

const isProd = process.env.NODE_ENV === "production";

log.setLevel(isProd ? "warn" : "debug");

// Optional: add timestamp
const originalFactory = log.methodFactory;
log.methodFactory = (methodName, logLevel, loggerName) => {
    const rawMethod = originalFactory(methodName, logLevel, loggerName);
    return (...args) => {
        const timestamp = new Date().toISOString();
        const { message, metadata } = normalizeArgs(args);
        const entry = `[${timestamp}] [${methodName.toUpperCase()}] ${message}`;

        if (metadata) {
            rawMethod(entry, metadata);
        } else {
            rawMethod(entry);
        }

        // Send logs to backend
        try {
            fetch("/api/logs", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    level: methodName,
                    message,
                    timestamp,
                    metadata,
                }),
                // allow the request to outlive page unloads/navigation (<=64KB)
                keepalive: true,
            }).catch((e) => {
              // Ignore abort errors from navigation/unload
              if (e && (e.name === "AbortError")) return;
              // Swallow network errors silently in production
            });
        } catch (_err) {
            // ignore network/abort errors in client
        }
    };
};

log.setLevel(log.getLevel());
log.rebuild();

const logger = {
    trace: (...args) => log.trace(...args),
    debug: (...args) => log.debug(...args),
    info: (...args) => log.info(...args),
    warn: (...args) => log.warn(...args),
    error: (...args) => log.error(...args),
    success: (...args) => log.info("[SUCCESS]", ...args),
};

export default logger;
