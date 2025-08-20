import {
  Controller,
  Get,
  Post,
  Delete,
  Param,
  Body,
  UseGuards,
  Res,
  HttpStatus,
  HttpException,
} from '@nestjs/common';
import { Response } from 'express';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../auth/guards/roles.guard';
import { Roles } from '../../auth/decorators/roles.decorator';
import { ReportGeneratorService } from '../services/report-generator.service';
import { Role } from '@prisma/client';
import * as path from 'path';

interface GenerateReportDto {
  type: 'daily' | 'weekly' | 'monthly' | 'custom';
  format: 'json' | 'csv' | 'pdf';
  sections: string[];
  startDate?: string;
  endDate?: string;
  recipients?: string[];
}

@Controller('admin/reports')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN)
export class ReportGeneratorController {
  constructor(private readonly reportGeneratorService: ReportGeneratorService) {}

  @Post('generate')
  async generateReport(@Body() generateReportDto: GenerateReportDto) {
    try {
      // 验证输入参数
      const validTypes = ['daily', 'weekly', 'monthly', 'custom'];
      if (!validTypes.includes(generateReportDto.type)) {
        throw new HttpException(
          {
            success: false,
            message: '无效的报告类型',
            validTypes,
          },
          HttpStatus.BAD_REQUEST,
        );
      }

      const validFormats = ['json', 'csv', 'pdf'];
      if (!validFormats.includes(generateReportDto.format)) {
        throw new HttpException(
          {
            success: false,
            message: '无效的报告格式',
            validFormats,
          },
          HttpStatus.BAD_REQUEST,
        );
      }

      const validSections = [
        'revenue',
        'subscriptions',
        'users',
        'content',
        'system',
        'performance',
      ];
      const invalidSections = generateReportDto.sections.filter(
        section => !validSections.includes(section),
      );
      if (invalidSections.length > 0) {
        throw new HttpException(
          {
            success: false,
            message: '包含无效的报告部分',
            invalidSections,
            validSections,
          },
          HttpStatus.BAD_REQUEST,
        );
      }

      // 解析日期
      let startDate: Date | undefined;
      let endDate: Date | undefined;

      if (generateReportDto.startDate) {
        startDate = new Date(generateReportDto.startDate);
        if (isNaN(startDate.getTime())) {
          throw new HttpException(
            {
              success: false,
              message: '无效的开始日期格式',
            },
            HttpStatus.BAD_REQUEST,
          );
        }
      }

      if (generateReportDto.endDate) {
        endDate = new Date(generateReportDto.endDate);
        if (isNaN(endDate.getTime())) {
          throw new HttpException(
            {
              success: false,
              message: '无效的结束日期格式',
            },
            HttpStatus.BAD_REQUEST,
          );
        }
      }

      if (startDate && endDate && startDate > endDate) {
        throw new HttpException(
          {
            success: false,
            message: '开始日期不能晚于结束日期',
          },
          HttpStatus.BAD_REQUEST,
        );
      }

      const config = {
        type: generateReportDto.type,
        format: generateReportDto.format,
        sections: generateReportDto.sections,
        recipients: generateReportDto.recipients,
      };

      const result = await this.reportGeneratorService.generateReport(config, startDate, endDate);

      return {
        success: true,
        message: '报告生成成功',
        data: {
          filePath: path.basename(result.filePath),
          metadata: result.data.metadata,
          summary: result.data.summary,
        },
      };
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }
      throw new HttpException(
        {
          success: false,
          message: '生成报告失败',
          error: error.message,
        },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @Get('list')
  async getAvailableReports() {
    try {
      const reports = await this.reportGeneratorService.getAvailableReports();

      // 解析文件信息
      const reportList = reports.map(filename => {
        const parts = filename.split('.');
        const extension = parts.pop();
        const nameWithoutExt = parts.join('.');

        // 尝试从文件名解析时间戳
        const timestampMatch = nameWithoutExt.match(/report-(.+)$/);
        const timestamp = timestampMatch ? timestampMatch[1] : null;

        return {
          filename,
          format: extension,
          timestamp,
          createdAt: timestamp ? timestamp.replace(/-/g, ':') : null,
        };
      });

      return {
        success: true,
        data: reportList,
        meta: {
          total: reportList.length,
          formats: [...new Set(reportList.map(r => r.format))],
        },
      };
    } catch (error) {
      throw new HttpException(
        {
          success: false,
          message: '获取报告列表失败',
          error: error.message,
        },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @Get('download/:filename')
  async downloadReport(
    @Param('filename') filename: string,
    @Res({ passthrough: true }) res: Response,
  ) {
    try {
      // 验证文件名安全性
      if (filename.includes('..') || filename.includes('/') || filename.includes('\\')) {
        throw new HttpException(
          {
            success: false,
            message: '无效的文件名',
          },
          HttpStatus.BAD_REQUEST,
        );
      }

      const fileBuffer = await this.reportGeneratorService.getReport(filename);

      // 设置响应头
      const extension = path.extname(filename).toLowerCase();
      let contentType = 'application/octet-stream';

      switch (extension) {
        case '.json':
          contentType = 'application/json';
          break;
        case '.csv':
          contentType = 'text/csv';
          break;
        case '.pdf':
          contentType = 'application/pdf';
          break;
      }

      res.set({
        'Content-Type': contentType,
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Content-Length': fileBuffer.length,
      });

      return fileBuffer;
    } catch (error) {
      throw new HttpException(
        {
          success: false,
          message: '下载报告失败',
          error: error.message,
        },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @Delete(':filename')
  async deleteReport(@Param('filename') filename: string) {
    try {
      // 验证文件名安全性
      if (filename.includes('..') || filename.includes('/') || filename.includes('\\')) {
        throw new HttpException(
          {
            success: false,
            message: '无效的文件名',
          },
          HttpStatus.BAD_REQUEST,
        );
      }

      await this.reportGeneratorService.deleteReport(filename);

      return {
        success: true,
        message: '报告删除成功',
        data: {
          filename,
          deletedAt: new Date().toISOString(),
        },
      };
    } catch (error) {
      throw new HttpException(
        {
          success: false,
          message: '删除报告失败',
          error: error.message,
        },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @Get('templates')
  async getReportTemplates() {
    try {
      const templates = {
        daily: {
          name: '日报模板',
          description: '包含每日关键指标的报告',
          sections: ['revenue', 'users', 'system'],
          format: 'json',
          schedule: '每日早上6点自动生成',
        },
        weekly: {
          name: '周报模板',
          description: '包含一周内详细分析的报告',
          sections: ['revenue', 'subscriptions', 'users', 'content'],
          format: 'json',
          schedule: '每周一早上生成',
        },
        monthly: {
          name: '月报模板',
          description: '包含月度综合分析的报告',
          sections: ['revenue', 'subscriptions', 'users', 'content', 'system', 'performance'],
          format: 'json',
          schedule: '每月1号生成',
        },
        performance: {
          name: '性能报告模板',
          description: '专注于系统性能和健康状态',
          sections: ['system', 'performance'],
          format: 'json',
          schedule: '按需生成',
        },
        financial: {
          name: '财务报告模板',
          description: '专注于收入和订阅分析',
          sections: ['revenue', 'subscriptions'],
          format: 'csv',
          schedule: '按需生成',
        },
      };

      return {
        success: true,
        data: templates,
        meta: {
          totalTemplates: Object.keys(templates).length,
          availableSections: [
            'revenue',
            'subscriptions',
            'users',
            'content',
            'system',
            'performance',
          ],
          availableFormats: ['json', 'csv', 'pdf'],
        },
      };
    } catch (error) {
      throw new HttpException(
        {
          success: false,
          message: '获取报告模板失败',
          error: error.message,
        },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @Post('generate/template/:templateName')
  async generateFromTemplate(
    @Param('templateName') templateName: string,
    @Body()
    options?: {
      format?: string;
      startDate?: string;
      endDate?: string;
    },
  ) {
    try {
      const templates = {
        daily: ['revenue', 'users', 'system'],
        weekly: ['revenue', 'subscriptions', 'users', 'content'],
        monthly: ['revenue', 'subscriptions', 'users', 'content', 'system', 'performance'],
        performance: ['system', 'performance'],
        financial: ['revenue', 'subscriptions'],
      };

      if (!templates[templateName]) {
        throw new HttpException(
          {
            success: false,
            message: '未找到指定的报告模板',
            availableTemplates: Object.keys(templates),
          },
          HttpStatus.NOT_FOUND,
        );
      }

      const generateReportDto: GenerateReportDto = {
        type:
          templateName === 'performance' || templateName === 'financial'
            ? 'custom'
            : (templateName as any),
        format: (options?.format as any) || 'json',
        sections: templates[templateName],
        startDate: options?.startDate,
        endDate: options?.endDate,
      };

      // 重用生成报告的逻辑
      return await this.generateReport(generateReportDto);
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }
      throw new HttpException(
        {
          success: false,
          message: '从模板生成报告失败',
          error: error.message,
        },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }
}
