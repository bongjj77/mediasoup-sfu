import { Injectable, LoggerService } from '@nestjs/common';
import { Logger } from 'winston';
import { WINSTON_MODULE_PROVIDER } from 'nest-winston';
import { Inject } from '@nestjs/common';

@Injectable()
export class CustomLogger implements LoggerService {
  private static instance: CustomLogger;

  constructor(
    @Inject(WINSTON_MODULE_PROVIDER) private readonly logger: Logger,
  ) {
    if (!CustomLogger.instance) {
      CustomLogger.instance = this;
    }
  }

  static getInstance(): CustomLogger {
    return CustomLogger.instance;
  }

  private formatMessage(message: string, optionalParams: any[]): string {
    return [message, ...optionalParams]
      .map((item) => (typeof item === 'object' ? JSON.stringify(item) : item))
      .join(' ');
  }

  log(message: string, ...optionalParams: any[]) {
    this.logger.info(this.formatMessage(message, optionalParams));
  }

  error(message: string, trace?: string, ...optionalParams: any[]) {
    this.logger.error(this.formatMessage(message, optionalParams), { trace });
  }

  warn(message: string, ...optionalParams: any[]) {
    this.logger.warn(this.formatMessage(message, optionalParams));
  }

  debug(message: string, ...optionalParams: any[]) {
    this.logger.debug(this.formatMessage(message, optionalParams));
  }

  verbose(message: string, ...optionalParams: any[]) {
    this.logger.verbose(this.formatMessage(message, optionalParams));
  }
}
