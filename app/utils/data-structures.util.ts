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

export class BoundedSet<T> {
    private set: Set<T>;
    private queue: Queue<T>;
    private max_size: number;

    constructor(max_size: number) {
        this.set = new Set();
        this.queue = new Queue();
        this.max_size = max_size;
    }

    has(value: T): boolean {
        return this.set.has(value);
    }

    add(value: T): void {
        if (this.set.has(value)) return;
        if (this.queue.size() >= this.max_size) {
            const oldest = this.queue.dequeue()!;
            this.set.delete(oldest);
        }
        this.set.add(value);
        this.queue.enqueue(value);
    }
}