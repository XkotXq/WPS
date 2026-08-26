"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { X } from "lucide-react";
import {
  DndContext,
  PointerSensor,
  TouchSensor,
  closestCenter,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  horizontalListSortingStrategy,
  useSortable,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { restrictToHorizontalAxis, restrictToParentElement } from "@dnd-kit/modifiers";
import { PAGE_REGISTRY } from "@/lib/dashboard-pages";

function SortableTab({ href, active, onClose }) {
  const tNav = useTranslations("nav");
  const page = PAGE_REGISTRY.find((item) => item.href === href);
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: href,
  });

  if (!page) return null;
  const Icon = page.icon;

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      className={`group relative flex shrink-0 touch-none select-none items-center gap-2 rounded-t-lg border px-3 py-2 text-sm font-medium transition-colors ${
        isDragging ? "opacity-50" : ""
      } ${
        active
          ? "-mb-px z-10 border-gray-200 dark:border-neutral-800 border-b-transparent bg-white dark:bg-neutral-900 text-navy-950 dark:text-white"
          : "border-transparent bg-transparent text-gray-500 dark:text-neutral-400 hover:bg-white/60 dark:hover:bg-neutral-900/60"
      }`}
    >
      <Link href={href} className="flex items-center gap-2">
        <Icon className="h-3.5 w-3.5 shrink-0" />
        {tNav(page.key)}
      </Link>
      <button
        type="button"
        onPointerDown={(event) => event.stopPropagation()}
        onClick={(event) => {
          event.preventDefault();
          onClose(href);
        }}
        title={tNav("closeTab")}
        className="cursor-pointer rounded p-0.5 text-gray-400 opacity-0 transition-opacity hover:bg-gray-200 hover:text-gray-700 group-hover:opacity-100 dark:text-neutral-500 dark:hover:bg-neutral-700 dark:hover:text-white"
      >
        <X className="h-3 w-3" />
      </button>
    </div>
  );
}

export default function RecentTabsBar({ paths, setPaths, activePath }) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { delay: 200, tolerance: 8 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 8 } })
  );

  function handleDragEnd(event) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    setPaths((prev) => {
      const oldIndex = prev.indexOf(active.id);
      const newIndex = prev.indexOf(over.id);
      if (oldIndex === -1 || newIndex === -1) return prev;
      return arrayMove(prev, oldIndex, newIndex);
    });
  }

  function handleClose(href) {
    setPaths((prev) => prev.filter((path) => path !== href));
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragEnd={handleDragEnd}
      modifiers={[restrictToHorizontalAxis, restrictToParentElement]}
    >
      <SortableContext items={paths} strategy={horizontalListSortingStrategy}>
        <div className="flex items-end gap-1 overflow-x-auto overflow-y-hidden border-b border-gray-200 dark:border-neutral-800 bg-gray-50 dark:bg-neutral-950/40 px-3 pt-2">
          {paths.map((href) => (
            <SortableTab key={href} href={href} active={activePath === href} onClose={handleClose} />
          ))}
        </div>
      </SortableContext>
    </DndContext>
  );
}
