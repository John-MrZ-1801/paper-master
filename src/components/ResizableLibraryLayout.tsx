import { useRef, useState, type PointerEvent, type ReactNode } from "react";

export function ResizableLibraryLayout({list,detail}:{list:ReactNode;detail:ReactNode}){
  const root=useRef<HTMLDivElement>(null);const [left,setLeft]=useState<number>();
  const start=(event:PointerEvent<HTMLDivElement>)=>{
    const element=root.current;if(!element)return;event.currentTarget.setPointerCapture(event.pointerId);
    const rect=element.getBoundingClientRect();
    const move=(next:globalThis.PointerEvent)=>setLeft(Math.max(280,Math.min(rect.width-360,next.clientX-rect.left)));
    const stop=()=>{window.removeEventListener("pointermove",move);window.removeEventListener("pointerup",stop);};
    window.addEventListener("pointermove",move);window.addEventListener("pointerup",stop);
  };
  return <div ref={root} className="library-layout resizable-library-layout" style={left?{gridTemplateColumns:`${left}px 9px minmax(0,1fr)`}:undefined}>{list}<div className="library-splitter" role="separator" aria-label="拖动调整论文列表与详情宽度" aria-orientation="vertical" tabIndex={0} onPointerDown={start}/>{detail}</div>;
}
