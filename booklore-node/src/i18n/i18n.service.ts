import { Injectable } from '@nestjs/common';
import { I18nService as NestI18nService } from 'nestjs-i18n';

@Injectable()
export class I18nService {
  constructor(private readonly i18n: NestI18nService) {}

  /**
   * 翻译文本
   * @param key 翻译键
   * @param options 翻译选项
   * @param lang 语言代码
   * @returns 翻译后的文本
   */
  translate(key: string, options?: any, lang?: string): string {
    return this.i18n.translate(key, {
      lang: lang || 'en',
      args: options,
    });
  }

  /**
   * 获取支持的语言列表
   * @returns 支持的语言代码数组
   */
  getSupportedLanguages(): string[] {
    return ['en', 'zh'];
  }

  /**
   * 验证语言代码是否支持
   * @param lang 语言代码
   * @returns 是否支持该语言
   */
  isLanguageSupported(lang: string): boolean {
    return this.getSupportedLanguages().includes(lang);
  }

  /**
   * 获取默认语言
   * @returns 默认语言代码
   */
  getDefaultLanguage(): string {
    return 'en';
  }

  /**
   * 格式化错误消息
   * @param errorKey 错误键
   * @param params 参数
   * @param lang 语言代码
   * @returns 格式化后的错误消息
   */
  formatErrorMessage(errorKey: string, params?: any, lang?: string): string {
    return this.translate(`errors.${errorKey}`, params, lang);
  }

  /**
   * 格式化成功消息
   * @param messageKey 消息键
   * @param params 参数
   * @param lang 语言代码
   * @returns 格式化后的成功消息
   */
  formatSuccessMessage(messageKey: string, params?: any, lang?: string): string {
    return this.translate(`messages.${messageKey}`, params, lang);
  }
}
