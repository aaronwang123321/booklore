import { Injectable, Logger } from '@nestjs/common';
import { promises as fs } from 'fs';
import { join } from 'path';

@Injectable()
export class PathService {
  private readonly logger = new Logger(PathService.name);

  async getFoldersAtPath(path: string): Promise<string[]> {
    try {
      // 检查路径是否存在
      const stats = await fs.stat(path);
      if (!stats.isDirectory()) {
        this.logger.warn(`Invalid path or not a directory: ${path}`);
        return [];
      }

      // 读取目录内容
      const entries = await fs.readdir(path, { withFileTypes: true });

      // 过滤出文件夹并返回完整路径
      const folders = entries
        .filter(entry => entry.isDirectory())
        .map(entry => join(path, entry.name))
        .sort();

      return folders;
    } catch (error) {
      this.logger.error(`Error accessing path ${path}: ${error.message}`, error.stack);
      return [];
    }
  }
}
