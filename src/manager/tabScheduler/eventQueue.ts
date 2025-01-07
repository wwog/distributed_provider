import { Emitter } from '../../event';
import { Logger } from '../../logger';

export interface EventQueueOptions<T> {
  filter: (item: Partial<T>, task: T) => boolean;
}

export class EventQueue<T = any> {
  static MAX_CONCURRENCY = 5;
  /**
   * 修改并发数
   */
  static changeConcurrency(value: number) {
    this.MAX_CONCURRENCY = value;
  }
  private eventQueue: T[] = [];
  private activeTasks: T[] = [];
  /** 任务是否正在分发 */
  private isDispatching = false;
  /** Loop是否正在排程 */
  private isLoopScheduled = false;
  private _onTaskActivation = new Emitter<{
    tasks: T[];
  }>();

  public onTaskActivation = this._onTaskActivation.event;
  private options: EventQueueOptions<T>;
  private logger = Logger.scope('EventQueue');

  constructor(options: EventQueueOptions<T>) {
    this.logger.info('EventQueue created');
    this.options = options;
  }

  /**
   * @description 添加任务到队列,等待执行
   */
  public enqueue(task: T) {
    this.logger.info('enqueue', task);
    this.eventQueue.push(task);
    if (this.isDispatching === false) {
      this.isDispatching = true;
      setTimeout(() => this.queueLoop());
    }
  }

  private queueLoop() {
    if (this.isLoopScheduled) {
      return;
    }
    this.isLoopScheduled = true;
    while (
      this.activeTasks.length < EventQueue.MAX_CONCURRENCY &&
      this.eventQueue.length > 0
    ) {
      const task = this.eventQueue.shift()!;
      this.activeTasks.push(task);
    }
    this.fireActiveTask();
    this.isLoopScheduled = false;
  }

  /**
   * @description 完成任务
   */
  public completeTask(item: Partial<T>) {
    const idx = this.activeTasks.findIndex((t) => this.options.filter(item, t));
    if (idx > -1) {
      this.activeTasks.splice(idx, 1);
      this.logger.info('task completed:', item);
    } else {
      this.logger.error('task not found:', item);
    }
    if (this.activeTasks.length === 0) {
      this.isDispatching = false;
      if (this.eventQueue.length > 0) {
        setTimeout(() => this.queueLoop());
      }
    }
  }

  /**
   * @description 激活任务
   */
  private fireActiveTask = () => {
    if (this._onTaskActivation.hasListeners()) {
      this._onTaskActivation.fire({
        tasks: this.activeTasks,
      });
    } else {
      //当任务激活时没有监听器时,任务将被完成，为了不阻断任务的执行,这里只是使用error级别的日志记录
      this.logger.error(
        'Severity error !!!!!! No listener for active task, task will be completed',
        this.activeTasks,
      );
    }
  };

  /**
   * @description 重新激活任务
   */
  public reActivation() {
    this.fireActiveTask();
  }

  public destroy() {
    this.logger.info('destroy');
    this.eventQueue = [];
    this.activeTasks = [];
    this._onTaskActivation.dispose();
  }
}
