import CircularArray from "esri/core/CircularArray";
import { isSome } from "esri/core/maybe";



export class Pool<T extends { new (...args: any[]): W }, W extends { initialize(...args: any[]): void }> {

  constructor(private readonly poolable_: T, size_: number) {
    this.buffer_ = new CircularArray(size_ * 4); 
  }

  private buffer_: CircularArray<W>;

  allocated = 0;
  released = 0

  reset(): void {
    this.allocated = 0;
    this.released = 0
  }
  
  release(value: W): void {
    this.released++; 
    let val =  this.buffer_.enqueue(value);

    if (isSome(val)) {
      //console.log(this.buffer_.size, this.poolable_)
    }
  }

  acquire(...args: Parameters<W["initialize"]>): W {
    this.allocated++; 
    let prev = this.buffer_.dequeue();

    if (isSome(prev)) {
      prev.initialize(...args)

      return prev; 
    }
    
    const newValue = new this.poolable_()

    newValue.initialize(...args);

    return newValue;
  }
}
