import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { Request } from 'express';

/**
 * 语言参数装饰器
 * 从请求中提取语言信息
 * 优先级：查询参数 > 请求头 > Accept-Language > 默认语言
 */
export const Language = createParamDecorator((data: unknown, ctx: ExecutionContext): string => {
  const request = ctx.switchToHttp().getRequest<Request>();

  // 1. 从查询参数获取语言
  const queryLang = request.query.lang as string;
  if (queryLang && isValidLanguage(queryLang)) {
    return queryLang;
  }

  // 2. 从自定义请求头获取语言
  const headerLang = request.headers['x-custom-lang'] as string;
  if (headerLang && isValidLanguage(headerLang)) {
    return headerLang;
  }

  // 3. 从Accept-Language请求头获取语言
  const acceptLanguage = request.headers['accept-language'];
  if (acceptLanguage) {
    const preferredLang = parseAcceptLanguage(acceptLanguage);
    if (preferredLang && isValidLanguage(preferredLang)) {
      return preferredLang;
    }
  }

  // 4. 返回默认语言
  return 'en';
});

/**
 * 验证语言代码是否有效
 * @param lang 语言代码
 * @returns 是否有效
 */
function isValidLanguage(lang: string): boolean {
  const supportedLanguages = ['en', 'zh'];
  return supportedLanguages.includes(lang);
}

/**
 * 解析Accept-Language请求头
 * @param acceptLanguage Accept-Language请求头值
 * @returns 首选语言代码
 */
function parseAcceptLanguage(acceptLanguage: string): string | null {
  try {
    // 解析Accept-Language格式：en-US,en;q=0.9,zh-CN;q=0.8,zh;q=0.7
    const languages = acceptLanguage
      .split(',')
      .map(lang => {
        const [code, quality] = lang.trim().split(';');
        const q = quality ? parseFloat(quality.split('=')[1]) : 1.0;
        return { code: code.toLowerCase(), quality: q };
      })
      .sort((a, b) => b.quality - a.quality);

    // 查找支持的语言
    for (const lang of languages) {
      // 尝试完整匹配（如 zh-cn）
      if (isValidLanguage(lang.code)) {
        return lang.code;
      }

      // 尝试主语言匹配（如 zh-cn -> zh）
      const primaryLang = lang.code.split('-')[0];
      if (isValidLanguage(primaryLang)) {
        return primaryLang;
      }
    }

    return null;
  } catch (error) {
    return null;
  }
}
