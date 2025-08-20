import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';
import { Transporter } from 'nodemailer';

export interface EmailTemplate {
  subject: string;
  html: string;
  text?: string;
}

export interface PaymentFailureEmailData {
  userName: string;
  planName: string;
  amount: number;
  currency: string;
  failureReason?: string;
  retryDate?: Date;
  isLastAttempt?: boolean;
  dashboardUrl: string;
}

export interface SubscriptionEmailData {
  userName: string;
  planName: string;
  amount: number;
  currency: string;
  nextBillingDate?: Date;
  dashboardUrl: string;
}

@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);
  private transporter: Transporter;

  constructor(private configService: ConfigService) {
    this.initializeTransporter();
  }

  private initializeTransporter() {
    const emailConfig = {
      host: this.configService.get('SMTP_HOST'),
      port: this.configService.get('SMTP_PORT', 587),
      secure: this.configService.get('SMTP_SECURE', false),
      auth: {
        user: this.configService.get('SMTP_USER'),
        pass: this.configService.get('SMTP_PASS'),
      },
    };

    this.transporter = nodemailer.createTransport(emailConfig);
  }

  async sendEmail(to: string, template: EmailTemplate, from?: string): Promise<boolean> {
    try {
      const fromAddress = from || this.configService.get('SMTP_FROM', 'noreply@booklore.com');

      const mailOptions = {
        from: fromAddress,
        to,
        subject: template.subject,
        html: template.html,
        text: template.text,
      };

      const result = await this.transporter.sendMail(mailOptions);
      this.logger.log(`Email sent successfully to ${to}: ${result.messageId}`);
      return true;
    } catch (error) {
      this.logger.error(`Failed to send email to ${to}:`, error);
      return false;
    }
  }

  generatePaymentFailureTemplate(data: PaymentFailureEmailData): EmailTemplate {
    const {
      userName,
      planName,
      amount,
      currency,
      failureReason,
      retryDate,
      isLastAttempt,
      dashboardUrl,
    } = data;

    const subject = isLastAttempt
      ? `[BookLore] 支付失败 - 订阅即将暂停`
      : `[BookLore] 支付失败 - 将自动重试`;

    const retryInfo = isLastAttempt
      ? '<p style="color: #dc3545; font-weight: bold;">这是最后一次尝试。如果不及时更新支付方式，您的订阅将被暂停。</p>'
      : retryDate
        ? `<p>我们将在 <strong>${retryDate.toLocaleDateString('zh-CN')}</strong> 自动重试收费。</p>`
        : '<p>我们将稍后自动重试收费。</p>';

    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <title>支付失败通知</title>
      </head>
      <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333;">
        <div style="max-width: 600px; margin: 0 auto; padding: 20px;">
          <div style="text-align: center; margin-bottom: 30px;">
            <h1 style="color: #2c3e50;">BookLore</h1>
          </div>

          <h2 style="color: #e74c3c;">支付失败通知</h2>

          <p>亲爱的 ${userName}，</p>

          <p>我们在处理您的 <strong>${planName}</strong> 订阅付款时遇到了问题。</p>

          <div style="background-color: #f8f9fa; padding: 15px; border-radius: 5px; margin: 20px 0;">
            <p><strong>订阅计划：</strong> ${planName}</p>
            <p><strong>金额：</strong> ${currency.toUpperCase()} ${(amount / 100).toFixed(2)}</p>
            ${failureReason ? `<p><strong>失败原因：</strong> ${failureReason}</p>` : ''}
          </div>

          ${retryInfo}

          <p>为了确保您的服务不中断，请：</p>
          <ul>
            <li>检查您的支付方式是否有效</li>
            <li>确保银行卡有足够余额</li>
            <li>更新过期的支付信息</li>
          </ul>

          <div style="text-align: center; margin: 30px 0;">
            <a href="${dashboardUrl}"
               style="background-color: #3498db; color: white; padding: 12px 24px;
                      text-decoration: none; border-radius: 5px; display: inline-block;">
              更新支付方式
            </a>
          </div>

          <p>如果您有任何疑问，请随时联系我们的客服团队。</p>

          <hr style="margin: 30px 0; border: none; border-top: 1px solid #eee;">
          <p style="font-size: 12px; color: #666; text-align: center;">
            此邮件由 BookLore 系统自动发送，请勿直接回复。
          </p>
        </div>
      </body>
      </html>
    `;

    const text = `
      BookLore - 支付失败通知

      亲爱的 ${userName}，

      我们在处理您的 ${planName} 订阅付款时遇到了问题。

      订阅计划：${planName}
      金额：${currency.toUpperCase()} ${(amount / 100).toFixed(2)}
      ${failureReason ? `失败原因：${failureReason}` : ''}

      ${
        isLastAttempt
          ? '这是最后一次尝试。如果不及时更新支付方式，您的订阅将被暂停。'
          : retryDate
            ? `我们将在 ${retryDate.toLocaleDateString('zh-CN')} 自动重试收费。`
            : '我们将稍后自动重试收费。'
      }

      请访问 ${dashboardUrl} 更新您的支付方式。

      如有疑问，请联系客服团队。
    `;

    return { subject, html, text };
  }

  generateSubscriptionSuccessTemplate(data: SubscriptionEmailData): EmailTemplate {
    const { userName, planName, amount, currency, nextBillingDate, dashboardUrl } = data;

    const subject = `[BookLore] 订阅成功确认 - ${planName}`;

    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <title>订阅成功确认</title>
      </head>
      <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333;">
        <div style="max-width: 600px; margin: 0 auto; padding: 20px;">
          <div style="text-align: center; margin-bottom: 30px;">
            <h1 style="color: #2c3e50;">BookLore</h1>
          </div>

          <h2 style="color: #27ae60;">订阅成功！</h2>

          <p>亲爱的 ${userName}，</p>

          <p>感谢您订阅 BookLore！您的订阅已成功激活。</p>

          <div style="background-color: #f8f9fa; padding: 15px; border-radius: 5px; margin: 20px 0;">
            <p><strong>订阅计划：</strong> ${planName}</p>
            <p><strong>金额：</strong> ${currency.toUpperCase()} ${(amount / 100).toFixed(2)}</p>
            ${nextBillingDate ? `<p><strong>下次扣费日期：</strong> ${nextBillingDate.toLocaleDateString('zh-CN')}</p>` : ''}
          </div>

          <p>现在您可以享受 BookLore 的全部功能：</p>
          <ul>
            <li>无限制阅读所有图书</li>
            <li>多设备同步阅读进度</li>
            <li>个性化推荐</li>
            <li>离线阅读功能</li>
          </ul>

          <div style="text-align: center; margin: 30px 0;">
            <a href="${dashboardUrl}"
               style="background-color: #27ae60; color: white; padding: 12px 24px;
                      text-decoration: none; border-radius: 5px; display: inline-block;">
              开始阅读
            </a>
          </div>

          <p>如果您有任何疑问，请随时联系我们的客服团队。</p>

          <hr style="margin: 30px 0; border: none; border-top: 1px solid #eee;">
          <p style="font-size: 12px; color: #666; text-align: center;">
            此邮件由 BookLore 系统自动发送，请勿直接回复。
          </p>
        </div>
      </body>
      </html>
    `;

    const text = `
      BookLore - 订阅成功确认

      亲爱的 ${userName}，

      感谢您订阅 BookLore！您的订阅已成功激活。

      订阅计划：${planName}
      金额：${currency.toUpperCase()} ${(amount / 100).toFixed(2)}
      ${nextBillingDate ? `下次扣费日期：${nextBillingDate.toLocaleDateString('zh-CN')}` : ''}

      现在您可以享受 BookLore 的全部功能。

      访问 ${dashboardUrl} 开始阅读。
    `;

    return { subject, html, text };
  }

  async testConnection(): Promise<boolean> {
    try {
      await this.transporter.verify();
      this.logger.log('SMTP connection verified successfully');
      return true;
    } catch (error) {
      this.logger.error('SMTP connection failed:', error);
      return false;
    }
  }
}
