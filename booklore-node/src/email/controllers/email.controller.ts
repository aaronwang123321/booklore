import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  UseGuards,
  Request,
  HttpStatus,
  ParseIntPipe,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { EmailService } from '../services/email.service';
import { EmailQueueService } from '../services/email-queue.service';
import { EmailProviderService } from '../services/email-provider.service';
import { EmailRecipientService } from '../services/email-recipient.service';
import {
  SendBookByEmailDto,
  CreateEmailProviderDto,
  UpdateEmailProviderDto,
  CreateEmailRecipientDto,
  UpdateEmailRecipientDto,
  TestEmailDto,
} from '../dto/email.dto';

@ApiTags('Email')
@Controller('email')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class EmailController {
  constructor(
    private readonly emailService: EmailService,
    private readonly emailQueueService: EmailQueueService,
    private readonly emailProviderService: EmailProviderService,
    private readonly emailRecipientService: EmailRecipientService,
  ) {}

  @Post('send-book')
  @ApiOperation({ summary: 'Send book by email' })
  @ApiResponse({ status: HttpStatus.ACCEPTED, description: 'Email job queued successfully' })
  @ApiResponse({ status: HttpStatus.BAD_REQUEST, description: 'Invalid request data' })
  @ApiResponse({ status: HttpStatus.NOT_FOUND, description: 'Book not found' })
  async sendBookByEmail(@Request() req, @Body() sendBookByEmailDto: SendBookByEmailDto) {
    const userId = req.user.userId;

    // Validate email addresses
    const { valid, invalid } = await this.emailRecipientService.validateEmails(
      sendBookByEmailDto.recipients,
    );

    if (invalid.length > 0) {
      return {
        success: false,
        message: 'Invalid email addresses found',
        invalidEmails: invalid,
      };
    }

    // Add job to queue
    const job = await this.emailQueueService.addEmailJob({
      bookId: sendBookByEmailDto.bookId,
      recipients: valid,
      subject: sendBookByEmailDto.subject,
      message: sendBookByEmailDto.message,
      userId,
    });

    return {
      success: true,
      message: 'Email job queued successfully',
      jobId: job.id,
      recipients: valid,
    };
  }

  @Post('test')
  @ApiOperation({ summary: 'Test email configuration' })
  @ApiResponse({ status: HttpStatus.OK, description: 'Test email sent successfully' })
  @ApiResponse({ status: HttpStatus.BAD_REQUEST, description: 'Email configuration error' })
  async testEmail(@Body() testEmailDto: TestEmailDto) {
    const result = await this.emailService.testEmailProvider(testEmailDto);

    return {
      success: result.success,
      message: result.success ? 'Test email sent successfully' : 'Failed to send test email',
      error: result.error,
      messageId: result.messageId,
    };
  }

  @Get('job/:jobId/status')
  @ApiOperation({ summary: 'Get email job status' })
  @ApiResponse({ status: HttpStatus.OK, description: 'Job status retrieved successfully' })
  @ApiResponse({ status: HttpStatus.NOT_FOUND, description: 'Job not found' })
  async getJobStatus(@Param('jobId') jobId: string) {
    const status = await this.emailQueueService.getJobStatus(jobId);

    if (!status) {
      return {
        success: false,
        message: 'Job not found',
      };
    }

    return {
      success: true,
      job: status,
    };
  }

  @Get('queue/stats')
  @ApiOperation({ summary: 'Get email queue statistics' })
  @ApiResponse({ status: HttpStatus.OK, description: 'Queue statistics retrieved successfully' })
  async getQueueStats() {
    const stats = await this.emailQueueService.getQueueStats();

    return {
      success: true,
      stats,
    };
  }

  // Email Provider Management
  @Post('providers')
  @ApiOperation({ summary: 'Create email provider' })
  @ApiResponse({ status: HttpStatus.CREATED, description: 'Email provider created successfully' })
  async createProvider(@Body() createEmailProviderDto: CreateEmailProviderDto) {
    const provider = await this.emailProviderService.create(createEmailProviderDto);

    return {
      success: true,
      message: 'Email provider created successfully',
      provider,
    };
  }

  @Get('providers')
  @ApiOperation({ summary: 'Get all email providers' })
  @ApiResponse({ status: HttpStatus.OK, description: 'Email providers retrieved successfully' })
  async findAllProviders() {
    const providers = await this.emailProviderService.findAll();

    return {
      success: true,
      providers,
    };
  }

  @Get('providers/:id')
  @ApiOperation({ summary: 'Get email provider by ID' })
  @ApiResponse({ status: HttpStatus.OK, description: 'Email provider retrieved successfully' })
  @ApiResponse({ status: HttpStatus.NOT_FOUND, description: 'Email provider not found' })
  async findOneProvider(@Param('id', ParseIntPipe) id: number) {
    const provider = await this.emailProviderService.findOne(id);

    return {
      success: true,
      provider,
    };
  }

  @Patch('providers/:id')
  @ApiOperation({ summary: 'Update email provider' })
  @ApiResponse({ status: HttpStatus.OK, description: 'Email provider updated successfully' })
  @ApiResponse({ status: HttpStatus.NOT_FOUND, description: 'Email provider not found' })
  async updateProvider(
    @Param('id', ParseIntPipe) id: number,
    @Body() updateEmailProviderDto: UpdateEmailProviderDto,
  ) {
    const provider = await this.emailProviderService.update(id, updateEmailProviderDto);

    return {
      success: true,
      message: 'Email provider updated successfully',
      provider,
    };
  }

  @Delete('providers/:id')
  @ApiOperation({ summary: 'Delete email provider' })
  @ApiResponse({ status: HttpStatus.OK, description: 'Email provider deleted successfully' })
  @ApiResponse({ status: HttpStatus.NOT_FOUND, description: 'Email provider not found' })
  @ApiResponse({ status: HttpStatus.CONFLICT, description: 'Cannot delete default provider' })
  async removeProvider(@Param('id', ParseIntPipe) id: number) {
    await this.emailProviderService.remove(id);

    return {
      success: true,
      message: 'Email provider deleted successfully',
    };
  }

  @Post('providers/:id/set-default')
  @ApiOperation({ summary: 'Set email provider as default' })
  @ApiResponse({ status: HttpStatus.OK, description: 'Default provider set successfully' })
  @ApiResponse({ status: HttpStatus.NOT_FOUND, description: 'Email provider not found' })
  async setDefaultProvider(@Param('id', ParseIntPipe) id: number) {
    const provider = await this.emailProviderService.setDefault(id);

    return {
      success: true,
      message: 'Default email provider set successfully',
      provider,
    };
  }

  @Post('providers/:id/test-connection')
  @ApiOperation({ summary: 'Test email provider connection' })
  @ApiResponse({ status: HttpStatus.OK, description: 'Connection test completed' })
  @ApiResponse({ status: HttpStatus.NOT_FOUND, description: 'Email provider not found' })
  async testProviderConnection(@Param('id', ParseIntPipe) id: number) {
    const isConnected = await this.emailProviderService.testConnection(id);

    return {
      success: isConnected,
      message: isConnected ? 'Connection successful' : 'Connection failed',
    };
  }

  // Email Recipient Management
  @Post('recipients')
  @ApiOperation({ summary: 'Create email recipient' })
  @ApiResponse({ status: HttpStatus.CREATED, description: 'Email recipient created successfully' })
  @ApiResponse({ status: HttpStatus.CONFLICT, description: 'Email recipient already exists' })
  async createRecipient(@Request() req, @Body() createEmailRecipientDto: CreateEmailRecipientDto) {
    const userId = req.user.userId;
    const recipient = await this.emailRecipientService.create(userId, createEmailRecipientDto);

    return {
      success: true,
      message: 'Email recipient created successfully',
      recipient,
    };
  }

  @Get('recipients')
  @ApiOperation({ summary: 'Get user email recipients' })
  @ApiResponse({ status: HttpStatus.OK, description: 'Email recipients retrieved successfully' })
  async findAllRecipients(@Request() req) {
    const userId = req.user.userId;
    const recipients = await this.emailRecipientService.findAllByUser(userId);

    return {
      success: true,
      recipients,
    };
  }

  @Get('recipients/:id')
  @ApiOperation({ summary: 'Get email recipient by ID' })
  @ApiResponse({ status: HttpStatus.OK, description: 'Email recipient retrieved successfully' })
  @ApiResponse({ status: HttpStatus.NOT_FOUND, description: 'Email recipient not found' })
  async findOneRecipient(@Request() req, @Param('id', ParseIntPipe) id: number) {
    const userId = req.user.userId;
    const recipient = await this.emailRecipientService.findOne(userId, id);

    return {
      success: true,
      recipient,
    };
  }

  @Patch('recipients/:id')
  @ApiOperation({ summary: 'Update email recipient' })
  @ApiResponse({ status: HttpStatus.OK, description: 'Email recipient updated successfully' })
  @ApiResponse({ status: HttpStatus.NOT_FOUND, description: 'Email recipient not found' })
  async updateRecipient(
    @Request() req,
    @Param('id', ParseIntPipe) id: number,
    @Body() updateEmailRecipientDto: UpdateEmailRecipientDto,
  ) {
    const userId = req.user.userId;
    const recipient = await this.emailRecipientService.update(userId, id, updateEmailRecipientDto);

    return {
      success: true,
      message: 'Email recipient updated successfully',
      recipient,
    };
  }

  @Delete('recipients/:id')
  @ApiOperation({ summary: 'Delete email recipient' })
  @ApiResponse({ status: HttpStatus.OK, description: 'Email recipient deleted successfully' })
  @ApiResponse({ status: HttpStatus.NOT_FOUND, description: 'Email recipient not found' })
  async removeRecipient(@Request() req, @Param('id', ParseIntPipe) id: number) {
    const userId = req.user.userId;
    await this.emailRecipientService.remove(userId, id);

    return {
      success: true,
      message: 'Email recipient deleted successfully',
    };
  }

  @Post('recipients/:id/set-default')
  @ApiOperation({ summary: 'Set email recipient as default' })
  @ApiResponse({ status: HttpStatus.OK, description: 'Default recipient set successfully' })
  @ApiResponse({ status: HttpStatus.NOT_FOUND, description: 'Email recipient not found' })
  async setDefaultRecipient(@Request() req, @Param('id', ParseIntPipe) id: number) {
    const userId = req.user.userId;
    const recipient = await this.emailRecipientService.setDefault(userId, id);

    return {
      success: true,
      message: 'Default email recipient set successfully',
      recipient,
    };
  }
}
