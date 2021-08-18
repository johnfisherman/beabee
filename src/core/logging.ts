import expressWinston from "express-winston";
import winston from "winston";

import config from "@config";

const appFormat = winston.format((info) => {
  const { app, ...rest } = info;
  return app ? { ...rest, message: `[${app}] ${rest.message}` } : info;
});

const logFormats = {
  json: winston.format.json(),
  simple: winston.format.combine(
    winston.format.colorize(),
    appFormat(),
    winston.format.simple()
  )
} as const;

const logger = winston.createLogger({
  format: logFormats[config.logFormat],
  levels: winston.config.syslog.levels,
  transports: [new winston.transports.Console()]
});

export const log = logger;

export const requestLogger = expressWinston.logger({
  winstonInstance: logger,
  msg: "{{req.method}} {{req.url}} {{res.statusCode}} {{res.responseTime}}ms",
  requestFilter: (req, propName) => {
    if (propName === "headers") {
      const { cookie, ...rest } = req.headers;
      return rest;
    } else {
      return req[propName];
    }
  }
});

export const requestErrorLogger = expressWinston.errorLogger({
  winstonInstance: logger
});

/*if (config.logSlack) {
  const stream = new BunyanSlack({
    level: config.logSlack.level as LogLevelString,
    webhook_url: config.logSlack.webhookUrl,
    channel: config.logSlack.channel,
    username: config.logSlack.username,
    customFormatter(record, levelName) {
      const msgPrefix =
        (config.dev ? "[DEV] " : "") + `[${levelName.toUpperCase()}] `;

      if (record.error) {
        return {
          text: msgPrefix + record.error.message,
          attachments: [
            {
              title: "Stack trace",
              text: record.error.stack
            }
          ]
        };
      } else {
        return {
          text: msgPrefix + record.msg
        };
      }
    }
  });
  mainConfig.streams.push({
    level: config.logSlack.level as LogLevelString,
    stream
  });
  reqConfig.streams.push({
    level: config.logSlack.level as LogLevelString,
    stream
  });
}*/
