import {Component, inject, OnInit} from '@angular/core';
import {SocketIOService} from './shared/websocket/socket-io.service';
import {BookService} from './book/service/book.service';
import {NotificationEventService} from './shared/websocket/notification-event.service';
import {parseLogNotification} from './shared/websocket/model/log-notification.model';
import {ConfirmDialog} from 'primeng/confirmdialog';
import {Toast} from 'primeng/toast';
import {RouterOutlet} from '@angular/router';
import {AuthInitializationService} from './auth-initialization-service';
import {AppConfigService} from './core/service/app-config.service';
import {MetadataBatchProgressNotification} from './core/model/metadata-batch-progress.model';
import {MetadataProgressService} from './core/service/metadata-progress-service';
import {BookdropFileService, BookdropFileNotification} from './bookdrop/bookdrop-file.service';

@Component({
  selector: 'app-root',
  templateUrl: './app.component.html',
  styleUrl: './app.component.scss',
  standalone: true,
  imports: [ConfirmDialog, Toast, RouterOutlet]
})
export class AppComponent implements OnInit {

  loading = true;
  private authInit = inject(AuthInitializationService);
  private bookService = inject(BookService);
  private socketIOService = inject(SocketIOService);
  private notificationEventService = inject(NotificationEventService);
  private metadataProgressService = inject(MetadataProgressService);
  private bookdropFileService = inject(BookdropFileService);
  private appConfigService = inject(AppConfigService);

  ngOnInit(): void {

    this.authInit.initialized$.subscribe(ready => {
      this.loading = !ready;
    });

    this.socketIOService.watch('/topic/book-add').subscribe((message: { body: string }) => {
      this.bookService.handleNewlyCreatedBook(JSON.parse(message.body));
    });

    this.socketIOService.watch('/topic/books-remove').subscribe((message: { body: string }) => {
      this.bookService.handleRemovedBookIds(JSON.parse(message.body));
    });

    this.socketIOService.watch('/topic/book-metadata-update').subscribe((message: { body: string }) => {
      this.bookService.handleBookUpdate(JSON.parse(message.body));
    });

    this.socketIOService.watch('/topic/book-metadata-batch-update').subscribe((message: { body: string }) => {
      const updatedBooks = JSON.parse(message.body);
      this.bookService.handleMultipleBookUpdates(updatedBooks);
    });

    this.socketIOService.watch('/topic/book-metadata-batch-progress').subscribe((message: { body: string }) => {
      const progress = JSON.parse(message.body) as MetadataBatchProgressNotification;
      this.metadataProgressService.handleIncomingProgress(progress);
    });

    this.socketIOService.watch('/topic/log').subscribe((message: { body: string }) => {
      const logNotification = parseLogNotification(message.body);
      this.notificationEventService.handleNewNotification(logNotification);
    });

    this.socketIOService.watch('/topic/bookdrop-file').subscribe((message: { body: string }) => {
      const notification = JSON.parse(message.body) as BookdropFileNotification;
      this.bookdropFileService.handleIncomingFile(notification);
    });
  }
}
