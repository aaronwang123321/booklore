import { Injectable, Logger, NotFoundException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../../shared/database/prisma.service';
import {
  MetadataTemplate,
  MetadataTemplateField,
  BookMetadataUpdate,
} from '../interfaces/metadata.interface';
import { CreateMetadataTemplateDto, UpdateMetadataTemplateDto } from '../dto/metadata.dto';

@Injectable()
export class MetadataTemplateService {
  private readonly logger = new Logger(MetadataTemplateService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Create a new metadata template
   */
  async createTemplate(
    userId: number,
    createDto: CreateMetadataTemplateDto,
  ): Promise<MetadataTemplate> {
    try {
      // Validate template fields
      this.validateTemplateFields(createDto.fields);

      const template = await this.prisma.metadataTemplate.create({
        data: {
          name: createDto.name,
          description: createDto.description,
          fields: createDto.fields as any,
          userId,
          isPublic: createDto.isPublic,
        },
      });

      this.logger.log(`Created metadata template: ${template.name} (ID: ${template.id})`);
      return this.mapToInterface(template);
    } catch (error) {
      this.logger.error(`Error creating metadata template: ${error.message}`);
      throw error;
    }
  }

  /**
   * Update an existing metadata template
   */
  async updateTemplate(
    templateId: number,
    userId: number,
    updateDto: UpdateMetadataTemplateDto,
  ): Promise<MetadataTemplate> {
    try {
      // Check if template exists and user has permission
      const existingTemplate = await this.prisma.metadataTemplate.findUnique({
        where: { id: templateId },
      });

      if (!existingTemplate) {
        throw new NotFoundException(`Template ${templateId} not found`);
      }

      if (existingTemplate.userId !== userId) {
        throw new ForbiddenException('You can only update your own templates');
      }

      // Validate fields if provided
      if (updateDto.fields) {
        this.validateTemplateFields(updateDto.fields);
      }

      const template = await this.prisma.metadataTemplate.update({
        where: { id: templateId },
        data: {
          ...updateDto,
          fields: updateDto.fields as any,
          updatedAt: new Date(),
        },
      });

      this.logger.log(`Updated metadata template: ${template.name} (ID: ${template.id})`);
      return this.mapToInterface(template);
    } catch (error) {
      this.logger.error(`Error updating metadata template: ${error.message}`);
      throw error;
    }
  }

  /**
   * Delete a metadata template
   */
  async deleteTemplate(templateId: number, userId: number): Promise<void> {
    try {
      const template = await this.prisma.metadataTemplate.findUnique({
        where: { id: templateId },
      });

      if (!template) {
        throw new NotFoundException(`Template ${templateId} not found`);
      }

      if (template.userId !== userId) {
        throw new ForbiddenException('You can only delete your own templates');
      }

      await this.prisma.metadataTemplate.delete({
        where: { id: templateId },
      });

      this.logger.log(`Deleted metadata template: ${template.name} (ID: ${templateId})`);
    } catch (error) {
      this.logger.error(`Error deleting metadata template: ${error.message}`);
      throw error;
    }
  }

  /**
   * Get a metadata template by ID
   */
  async getTemplate(templateId: number, userId?: number): Promise<MetadataTemplate> {
    try {
      const template = await this.prisma.metadataTemplate.findUnique({
        where: { id: templateId },
        include: {
          user: {
            select: { id: true, name: true, email: true },
          },
        },
      });

      if (!template) {
        throw new NotFoundException(`Template ${templateId} not found`);
      }

      // Check access permissions
      if (!template.isPublic && template.userId !== userId) {
        throw new ForbiddenException('You do not have access to this template');
      }

      return this.mapToInterface(template);
    } catch (error) {
      this.logger.error(`Error getting metadata template: ${error.message}`);
      throw error;
    }
  }

  /**
   * Get all templates accessible to a user
   */
  async getTemplates(userId: number, includePublic: boolean = true): Promise<MetadataTemplate[]> {
    try {
      const where: any = {
        OR: [
          { userId }, // User's own templates
        ],
      };

      if (includePublic) {
        where.OR.push({ isPublic: true }); // Public templates
      }

      const templates = await this.prisma.metadataTemplate.findMany({
        where,
        orderBy: [
          { userId: 'asc' }, // Own templates first
          { name: 'asc' },
        ],
        include: {
          user: {
            select: { id: true, name: true, email: true },
          },
        },
      });

      return templates.map(template => this.mapToInterface(template));
    } catch (error) {
      this.logger.error(`Error getting metadata templates: ${error.message}`);
      throw error;
    }
  }

  /**
   * Apply a template to generate metadata updates
   */
  async applyTemplate(
    templateId: number,
    baseMetadata: Partial<BookMetadataUpdate>,
    userId?: number,
  ): Promise<BookMetadataUpdate> {
    try {
      const template = await this.getTemplate(templateId, userId);
      const result: BookMetadataUpdate = { ...baseMetadata };

      for (const field of template.fields) {
        const fieldValue = this.applyTemplateField(field, baseMetadata);
        if (fieldValue !== undefined) {
          (result as any)[field.fieldName] = fieldValue;
        }
      }

      // Validate the result
      this.validateMetadataUpdate(result, template.fields);

      this.logger.log(`Applied template ${template.name} to metadata`);
      return result;
    } catch (error) {
      this.logger.error(`Error applying metadata template: ${error.message}`);
      throw error;
    }
  }

  /**
   * Apply template to multiple books
   */
  async applyTemplateToBooks(
    templateId: number,
    bookIds: number[],
    userId: number,
    overrideValues?: Partial<BookMetadataUpdate>,
  ): Promise<{
    successful: number[];
    failed: { bookId: number; error: string }[];
  }> {
    try {
      const template = await this.getTemplate(templateId, userId);
      const successful: number[] = [];
      const failed: { bookId: number; error: string }[] = [];

      for (const bookId of bookIds) {
        try {
          // Get current book metadata
          const book = await this.prisma.book.findUnique({
            where: { id: bookId },
          });

          if (!book) {
            failed.push({ bookId, error: 'Book not found' });
            continue;
          }

          // Apply template
          const currentMetadata = this.extractBookMetadata(book);
          const templateResult = await this.applyTemplate(templateId, currentMetadata, userId);

          // Apply any override values
          const finalMetadata = { ...templateResult, ...overrideValues };

          // Update book
          await this.prisma.book.update({
            where: { id: bookId },
            data: this.mapToBookUpdateData(finalMetadata),
          });

          successful.push(bookId);
        } catch (error) {
          failed.push({ bookId, error: error.message });
        }
      }

      this.logger.log(
        `Applied template ${template.name} to ${successful.length}/${bookIds.length} books`,
      );
      return { successful, failed };
    } catch (error) {
      this.logger.error(`Error applying template to books: ${error.message}`);
      throw error;
    }
  }

  /**
   * Create a template from existing book metadata
   */
  async createTemplateFromBook(
    bookId: number,
    templateName: string,
    templateDescription: string,
    userId: number,
    isPublic: boolean = false,
  ): Promise<MetadataTemplate> {
    try {
      const book = await this.prisma.book.findUnique({
        where: { id: bookId },
      });

      if (!book) {
        throw new NotFoundException(`Book ${bookId} not found`);
      }

      // Extract fields from book metadata
      const fields: MetadataTemplateField[] = [];
      const bookMetadata = this.extractBookMetadata(book);

      for (const [fieldName, value] of Object.entries(bookMetadata)) {
        if (value !== null && value !== undefined && value !== '') {
          fields.push({
            fieldName,
            defaultValue: value,
            required: this.isRequiredField(fieldName),
            validation: this.getFieldValidation(fieldName),
          });
        }
      }

      const createDto: CreateMetadataTemplateDto = {
        name: templateName,
        description: templateDescription,
        fields,
        isPublic,
      };

      return await this.createTemplate(userId, createDto);
    } catch (error) {
      this.logger.error(`Error creating template from book: ${error.message}`);
      throw error;
    }
  }

  /**
   * Get template usage statistics
   */
  async getTemplateStats(
    templateId: number,
    userId?: number,
  ): Promise<{
    usageCount: number;
    lastUsed: Date | null;
    popularFields: { fieldName: string; usageCount: number }[];
  }> {
    try {
      const template = await this.getTemplate(templateId, userId);

      // This would require tracking template usage in the database
      // For now, return placeholder data
      return {
        usageCount: 0,
        lastUsed: null,
        popularFields: template.fields.map(field => ({
          fieldName: field.fieldName,
          usageCount: 0,
        })),
      };
    } catch (error) {
      this.logger.error(`Error getting template stats: ${error.message}`);
      throw error;
    }
  }

  private validateTemplateFields(fields: MetadataTemplateField[]): void {
    const validFieldNames = [
      'title',
      'author',
      'isbn',
      'language',
      'publisher',
      'publishDate',
      'description',
      'coverImageUrl',
      'genres',
      'rating',
      'pageCount',
    ];

    for (const field of fields) {
      if (!validFieldNames.includes(field.fieldName)) {
        throw new Error(`Invalid field name: ${field.fieldName}`);
      }

      if (field.validation) {
        try {
          new RegExp(field.validation);
        } catch {
          throw new Error(`Invalid validation regex for field ${field.fieldName}`);
        }
      }
    }
  }

  private applyTemplateField(
    field: MetadataTemplateField,
    baseMetadata: Partial<BookMetadataUpdate>,
  ): any {
    const currentValue = (baseMetadata as any)[field.fieldName];

    // If field already has a value and it's not required to override, keep current value
    if (currentValue !== null && currentValue !== undefined && currentValue !== '') {
      return currentValue;
    }

    // Apply default value
    let value = field.defaultValue;

    // Apply transformation if specified
    if (field.transformation && value) {
      value = this.applyTransformation(value, field.transformation);
    }

    return value;
  }

  private applyTransformation(value: any, transformation: string): any {
    try {
      // Simple transformation rules
      switch (transformation) {
        case 'uppercase':
          return typeof value === 'string' ? value.toUpperCase() : value;
        case 'lowercase':
          return typeof value === 'string' ? value.toLowerCase() : value;
        case 'title_case':
          return typeof value === 'string' ? this.toTitleCase(value) : value;
        case 'trim':
          return typeof value === 'string' ? value.trim() : value;
        default:
          return value;
      }
    } catch (error) {
      this.logger.warn(`Error applying transformation ${transformation}: ${error.message}`);
      return value;
    }
  }

  private toTitleCase(str: string): string {
    return str.replace(/\w\S*/g, txt => txt.charAt(0).toUpperCase() + txt.substr(1).toLowerCase());
  }

  private validateMetadataUpdate(
    metadata: BookMetadataUpdate,
    fields: MetadataTemplateField[],
  ): void {
    for (const field of fields) {
      const value = (metadata as any)[field.fieldName];

      // Check required fields
      if (field.required && (value === null || value === undefined || value === '')) {
        throw new Error(`Required field ${field.fieldName} is missing`);
      }

      // Check validation regex
      if (field.validation && value && typeof value === 'string') {
        const regex = new RegExp(field.validation);
        if (!regex.test(value)) {
          throw new Error(`Field ${field.fieldName} does not match validation pattern`);
        }
      }
    }
  }

  private extractBookMetadata(book: any): Partial<BookMetadataUpdate> {
    return {
      title: book.title,
      author: book.author,
      isbn: book.isbn,
      language: book.language,
      publisher: book.publisher,
      publishDate: book.publishDate,
      description: book.description,
      coverImageUrl: book.coverImage,
      genres: book.genres,
      rating: book.rating,
      pageCount: book.pageCount,
    };
  }

  private mapToBookUpdateData(metadata: BookMetadataUpdate): any {
    return {
      title: metadata.title,
      author: metadata.author,
      isbn: metadata.isbn,
      language: metadata.language,
      publisher: metadata.publisher,
      publishDate: metadata.publishDate ? new Date(metadata.publishDate) : undefined,
      description: metadata.description,
      coverImage: metadata.coverImageUrl,
      genres: metadata.genres,
      rating: metadata.rating,
      pageCount: metadata.pageCount,
    };
  }

  private isRequiredField(fieldName: string): boolean {
    const requiredFields = ['title', 'author'];
    return requiredFields.includes(fieldName);
  }

  private getFieldValidation(fieldName: string): string | undefined {
    const validations: Record<string, string> = {
      isbn: '^[0-9-]{10,17}$',
      language: '^[a-z]{2}$',
      rating: '^[0-5](\.[0-9])?$',
    };
    return validations[fieldName];
  }

  private mapToInterface(template: any): MetadataTemplate {
    return {
      id: template.id,
      name: template.name,
      description: template.description,
      fields: template.fields,
      userId: template.userId,
      isPublic: template.isPublic,
      createdAt: template.createdAt,
      updatedAt: template.updatedAt,
    };
  }
}
