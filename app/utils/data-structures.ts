export class Queue<T> {
    private q: T[] = [];
    enqueue(item: T): void {
      this.q.push(item);
    }
    dequeue(): T | undefined {
      return this.q.shift();
    }
    peek(): T | undefined {
        return this.q[0];
    }
    isEmpty(): boolean {
        return this.q.length === 0;
    }
    size(): number {
      return this.q.length;
    }
  }

export interface Dictionary<T> {
    [Key: string]: T;
}