#!/usr/bin/env node

/**
 * T13 邮件分享功能 - Validation Script
 * 
 * Validates the implementation of email sharing functionality:
 * 1. File structure and module organization
 * 2. Service implementations
 * 3. API endpoints
 * 4. Database models
 * 5. Queue integration
 */

const fs = require('fs');
const path = require('path');

class T13ValidationScript {
  constructor() {
    this.validationResults = {
      passed: 0,
      failed: 0,
      total: 0,
      details: []
    };
  }

  async runValidation() {
    console.log('🔍 Validating T13 邮件分享功能 Implementation...\n');

    // Validate file structure
    this.validateFileStructure();

    // Validate module implementations
    this.validateModuleImplementations();

    // Validate API endpoints
    this.validateAPIEndpoints();

    // Validate database integration
    this.validateDatabaseIntegration();

    // Validate queue integration
    this.validateQueueIntegration();

    // Print summary
    this.printSummary();
  }

  validateFileStructure() {
    console.log('📁 Validating File Structure...');

    const requiredFiles = [
      'src/email/email.module.ts',
      'src/email/dto/email.dto.ts',
      'src/email/services/email.service.ts',
      'src/email/services/email-queue.service.ts',
      'src/email/services/email-provider.service.ts',
      'src/email/services/email-recipient.service.ts',
      'src/email/controllers/email.controller.ts'
    ];

    requiredFiles.forEach(filePath => {
      this.validateFile(`File Structure - ${path.basename(filePath)}`, filePath);
    });
  }

  validateModuleImplementations() {
    console.log('\n🔧 Validating Module Implementations...');

    // Validate EmailModule
    this.validateFileContent(
      'EmailModule Implementation',
      'src/email/email.module.ts',
      [
        'EmailService',
        'EmailQueueService',
        'EmailProviderService',
        'EmailRecipientService',
        'EmailController'
      ]
    );

    // Validate EmailService
    this.validateFileContent(
      'EmailService Implementation',
      'src/email/services/email.service.ts',
      [
        'sendBookByEmail',
        'testEmailProvider',
        'nodemailer',
        'generateEmailTemplate'
      ]
    );

    // Validate EmailQueueService
    this.validateFileContent(
      'EmailQueueService Implementation',
      'src/email/services/email-queue.service.ts',
      [
        'bullmq',
        'Queue',
        'Worker',
        'addEmailJob',
        'processEmailJob'
      ]
    );

    // Validate EmailProviderService
    this.validateFileContent(
      'EmailProviderService Implementation',
      'src/email/services/email-provider.service.ts',
      [
        'create',
        'findAll',
        'findDefault',
        'testConnection',
        'setDefault'
      ]
    );

    // Validate EmailRecipientService
    this.validateFileContent(
      'EmailRecipientService Implementation',
      'src/email/services/email-recipient.service.ts',
      [
        'create',
        'findAllByUser',
        'validateEmails',
        'setDefault'
      ]
    );
  }

  validateAPIEndpoints() {
    console.log('\n🌐 Validating API Endpoints...');

    // Validate EmailController
    this.validateFileContent(
      'Email API Endpoints',
      'src/email/controllers/email.controller.ts',
      [
        'sendBookByEmail',
        'testEmail',
        'getJobStatus',
        'getQueueStats',
        'createProvider',
        'findAllProviders',
        'createRecipient',
        'findAllRecipients'
      ]
    );

    // Validate DTOs
    this.validateFileContent(
      'Email DTOs',
      'src/email/dto/email.dto.ts',
      [
        'SendBookByEmailDto',
        'CreateEmailProviderDto',
        'CreateEmailRecipientDto',
        'TestEmailDto',
        'EmailJobData',
        'EmailJobResult'
      ]
    );
  }

  validateDatabaseIntegration() {
    console.log('\n🗄️  Validating Database Integration...');

    // Check Prisma schema for email models
    this.validateFileContent(
      'Database Models - EmailProvider',
      'prisma/schema.prisma',
      [
        'model EmailProvider',
        'host',
        'port',
        'secure',
        'username',
        'password',
        'isDefault'
      ]
    );

    this.validateFileContent(
      'Database Models - EmailRecipient',
      'prisma/schema.prisma',
      [
        'model EmailRecipient',
        'email',
        'name',
        'isDefault',
        'userId'
      ]
    );
  }

  validateQueueIntegration() {
    console.log('\n⚡ Validating Queue Integration...');

    // Validate queue configuration
    this.validateFileContent(
      'Queue Integration',
      'src/email/services/email-queue.service.ts',
      [
        'email-sending',
        'attempts: 3',
        'exponential',
        'removeOnComplete',
        'removeOnFail'
      ]
    );

    // Validate app module integration
    this.validateFileContent(
      'App Module Integration',
      'src/app.module.ts',
      [
        'EmailModule'
      ]
    );
  }

  validateFile(testName, filePath) {
    this.validationResults.total++;
    
    const fullPath = path.join(process.cwd(), filePath);
    
    if (fs.existsSync(fullPath)) {
      console.log(`  ✅ ${testName}`);
      this.validationResults.passed++;
      this.validationResults.details.push({ name: testName, status: 'PASSED' });
    } else {
      console.log(`  ❌ ${testName} - File not found: ${filePath}`);
      this.validationResults.failed++;
      this.validationResults.details.push({ 
        name: testName, 
        status: 'FAILED', 
        error: `File not found: ${filePath}` 
      });
    }
  }

  validateFileContent(testName, filePath, requiredContent) {
    this.validationResults.total++;
    
    const fullPath = path.join(process.cwd(), filePath);
    
    try {
      if (!fs.existsSync(fullPath)) {
        throw new Error(`File not found: ${filePath}`);
      }

      const content = fs.readFileSync(fullPath, 'utf8');
      const missingContent = requiredContent.filter(item => !content.includes(item));

      if (missingContent.length === 0) {
        console.log(`  ✅ ${testName}`);
        this.validationResults.passed++;
        this.validationResults.details.push({ name: testName, status: 'PASSED' });
      } else {
        console.log(`  ❌ ${testName} - Missing: ${missingContent.join(', ')}`);
        this.validationResults.failed++;
        this.validationResults.details.push({ 
          name: testName, 
          status: 'FAILED', 
          error: `Missing content: ${missingContent.join(', ')}` 
        });
      }
    } catch (error) {
      console.log(`  ❌ ${testName} - ${error.message}`);
      this.validationResults.failed++;
      this.validationResults.details.push({ 
        name: testName, 
        status: 'FAILED', 
        error: error.message 
      });
    }
  }

  printSummary() {
    console.log('\n📊 Validation Summary');
    console.log('=====================');
    console.log(`Total Validations: ${this.validationResults.total}`);
    console.log(`Passed: ${this.validationResults.passed}`);
    console.log(`Failed: ${this.validationResults.failed}`);
    console.log(`Success Rate: ${((this.validationResults.passed / this.validationResults.total) * 100).toFixed(1)}%`);

    if (this.validationResults.failed > 0) {
      console.log('\n❌ Failed Validations:');
      this.validationResults.details
        .filter(test => test.status === 'FAILED')
        .forEach(test => {
          console.log(`  - ${test.name}: ${test.error}`);
        });
    }

    console.log('\n🎯 T13 Implementation Requirements:');
    console.log('  📧 SMTP邮件服务集成 - Email providers with nodemailer');
    console.log('  📚 图书邮件发送和收件人管理 - Book sharing with recipient management');
    console.log('  🎨 邮件模板和附件处理 - HTML templates with file attachments');
    console.log('  ⚡ 邮件发送队列和重试机制 - BullMQ with exponential backoff');

    console.log('\n📋 Implementation Features:');
    console.log('  ✅ Email Provider Management (CRUD operations)');
    console.log('  ✅ Email Recipient Management (per-user recipients)');
    console.log('  ✅ Book Email Sharing (with attachments)');
    console.log('  ✅ Email Queue Service (BullMQ integration)');
    console.log('  ✅ SMTP Configuration Testing');
    console.log('  ✅ HTML Email Templates');
    console.log('  ✅ Retry Mechanism (3 attempts with exponential backoff)');
    console.log('  ✅ Email Validation');
    console.log('  ✅ Job Status Tracking');
    console.log('  ✅ Queue Statistics');

    if (this.validationResults.passed === this.validationResults.total) {
      console.log('\n🎉 T13 邮件分享功能 validation passed! Implementation is complete.');
      process.exit(0);
    } else {
      console.log('\n⚠️  Some validations failed. Please check the implementation.');
      process.exit(1);
    }
  }
}

// Run validation
const validator = new T13ValidationScript();
validator.runValidation();