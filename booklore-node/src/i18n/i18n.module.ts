import { Module } from '@nestjs/common';
import { I18nModule, QueryResolver, HeaderResolver, AcceptLanguageResolver } from 'nestjs-i18n';
import * as path from 'path';
import { I18nService } from './i18n.service';

@Module({
  imports: [
    I18nModule.forRoot({
      fallbackLanguage: 'en',
      loaderOptions: {
        path: path.join(__dirname, '/'),
        watch: true,
      },
      resolvers: [
        { use: QueryResolver, options: ['lang'] },
        { use: HeaderResolver, options: ['x-custom-lang'] },
        new AcceptLanguageResolver(),
      ],
      typesOutputPath: path.join(__dirname, '../generated/i18n.generated.ts'),
    }),
  ],
  providers: [I18nService],
  exports: [I18nModule, I18nService],
})
export class I18nConfigModule {}
