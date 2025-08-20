import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../shared/database/prisma.service';
import { AppSettingsResponseDto, SettingRequestDto, AppSettingDto } from './dto/app-setting.dto';

@Injectable()
export class AppSettingService {
  constructor(private readonly prisma: PrismaService) {}

  async getAppSettings(): Promise<AppSettingsResponseDto> {
    const settings = await this.prisma.appSetting.findMany({
      orderBy: {
        key: 'asc',
      },
    });

    const mappedSettings: AppSettingDto[] = settings.map(setting => ({
      id: setting.id,
      key: setting.key,
      value: this.parseSettingValue(setting.value as string),
      createdAt: setting.createdAt,
      updatedAt: setting.updatedAt,
    }));

    return {
      settings: mappedSettings,
      total: settings.length,
    };
  }

  async updateSettings(settingRequests: SettingRequestDto[]): Promise<void> {
    for (const request of settingRequests) {
      await this.updateSetting(request.name, request.value);
    }
  }

  async updateSetting(key: string, value: string): Promise<void> {
    try {
      // Validate JSON format
      const parsedValue = JSON.parse(value);
      const jsonValue = JSON.stringify(parsedValue);

      await this.prisma.appSetting.upsert({
        where: { key },
        update: {
          value: jsonValue,
          updatedAt: new Date(),
        },
        create: {
          key,
          value: jsonValue,
        },
      });
    } catch (error) {
      if (error instanceof SyntaxError) {
        throw new BadRequestException(`Invalid JSON format for setting '${key}': ${error.message}`);
      }
      throw error;
    }
  }

  async getSetting(key: string): Promise<any> {
    const setting = await this.prisma.appSetting.findUnique({
      where: { key },
    });

    if (!setting) {
      throw new NotFoundException(`Setting with key '${key}' not found`);
    }

    return this.parseSettingValue(setting.value as string);
  }

  async deleteSetting(key: string): Promise<void> {
    const setting = await this.prisma.appSetting.findUnique({
      where: { key },
    });

    if (!setting) {
      throw new NotFoundException(`Setting with key '${key}' not found`);
    }

    await this.prisma.appSetting.delete({
      where: { key },
    });
  }

  private parseSettingValue(value: string): any {
    try {
      return JSON.parse(value);
    } catch (error) {
      // If parsing fails, return the raw string value
      return value;
    }
  }
}
