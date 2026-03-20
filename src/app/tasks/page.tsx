"use client";

import { useState } from "react";
import Sidebar from "@/components/Sidebar";
import Modal from "@/components/Modal";
import SearchFilter from "@/components/SearchFilter";
import { useApp } from "@/context/AppContext";
import PageLoading from "@/components/PageLoading";
import EmptyState from "@/components/EmptyState";

const FIELDS = [
  { key: "title",    label: "Title" },
  { key: "leadName", label: "Lead" },
  { key: "due",      label: "Due Date" },
  { key: "priority", label: "Priority" },
];

const priorityStyles: Record<string, string> = {
  High:   "bg-red-100 text-red-600",
  Medium: "bg-yellow-100 text-yellow-700",
  Low:    "bg-gray-100 text-gray-500",
};

const emptyForm = { title: "", leadName: "", due: "", priority: "Medium", done: false };

export default function TasksPage() {
  const { tasks, addTask, toggleTask, loaded } = useApp();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [query, setQuery] = useState("");
  const [activeFields, setActiveFields] = useState(FIELDS.map((f) => f.key));

  const matches = (task: typeof tasks[0]) =>
    !query.trim() ||
    activeFields.some((field) =>
      String(task[field as keyof typeof task]).toLowerCase().includes(query.toLowerCase())
    );

  const pending   = tasks.filter((t) => !t.done && matches(t));
  const completed = tasks.filter((t) =>  t.done && matches(t));

  function handleAdd() {
    if (!form.title) return;
    addTask(form);
    setForm(emptyForm);
    setOpen(false);
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <Sidebar />
      <main className="pt-16 lg:pt-0 lg:ml-64 p-4 sm:p-6 lg:p-8">
        {!loaded ? <PageLoading /> : (<>
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="text-2xl font-bold text-gray-900">Tasks</h2>
            <p className="text-sm text-gray-500 mt-1">{pending.length} pending · {completed.length} completed</p>
          </div>
          <button onClick={() => setOpen(true)} className="bg-blue-600 text-white text-sm font-medium px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors">
            + Add Task
          </button>
        </div>

        <SearchFilter
          query={query}
          onQueryChange={setQuery}
          fields={FIELDS}
          activeFields={activeFields}
          onFieldsChange={setActiveFields}
          placeholder="Search tasks..."
        />

        {/* Pending */}
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden mb-4">
          <div className="px-5 py-3 bg-gray-50 border-b border-gray-200">
            <h3 className="text-sm font-semibold text-gray-700">Pending ({pending.length})</h3>
          </div>
          <ul className="divide-y divide-gray-100">
            {pending.length === 0 ? (
              <li><EmptyState icon="✓" title="All caught up" description="No pending tasks. Create a new task or check back later." /></li>
            ) : pending.map((task) => (
              <li key={task.id} className="flex items-center gap-4 px-5 py-3.5 hover:bg-gray-50">
                <input type="checkbox" className="w-4 h-4 rounded border-gray-300 text-blue-600 cursor-pointer" onChange={() => toggleTask(task.id)} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-medium text-gray-800">{task.title}</p>
                    {task.auto && (
                      <span className="text-xs bg-blue-50 text-blue-600 border border-blue-200 rounded-full px-2 py-0.5 font-medium">auto</span>
                    )}
                  </div>
                  <p className="text-xs text-gray-400 mt-0.5">Lead: {task.leadName}</p>
                </div>
                <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${priorityStyles[task.priority]}`}>{task.priority}</span>
                <span className="text-xs text-gray-400 w-20 text-right">{task.due}</span>
              </li>
            ))}
          </ul>
        </div>

        {/* Completed */}
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="px-5 py-3 bg-gray-50 border-b border-gray-200">
            <h3 className="text-sm font-semibold text-gray-500">Completed ({completed.length})</h3>
          </div>
          <ul className="divide-y divide-gray-100">
            {completed.length === 0 ? (
              <li><EmptyState icon="🎉" title="No completed tasks yet" description="Completed tasks will appear here as you work through your list." /></li>
            ) : completed.map((task) => (
              <li key={task.id} className="flex items-center gap-4 px-5 py-3.5 hover:bg-gray-50 opacity-60">
                <input type="checkbox" defaultChecked className="w-4 h-4 rounded border-gray-300 text-blue-600 cursor-pointer" onChange={() => toggleTask(task.id)} />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-400 line-through">{task.title}</p>
                  <p className="text-xs text-gray-400 mt-0.5">Lead: {task.leadName}</p>
                </div>
                <span className="text-xs text-gray-400 w-20 text-right">{task.due}</span>
              </li>
            ))}
          </ul>
        </div>
        </>)}
      </main>

      {open && (
        <Modal title="Add Task" onClose={() => setOpen(false)}>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Task Title *</label>
              <input className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500" placeholder="What needs to be done?" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Related Lead</label>
              <input className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500" placeholder="Lead name" value={form.leadName} onChange={(e) => setForm({ ...form, leadName: e.target.value })} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Due Date</label>
                <input type="date" className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500" value={form.due} onChange={(e) => setForm({ ...form, due: e.target.value })} />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Priority</label>
                <select className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500" value={form.priority} onChange={(e) => setForm({ ...form, priority: e.target.value })}>
                  <option>High</option><option>Medium</option><option>Low</option>
                </select>
              </div>
            </div>
            <div className="flex justify-end gap-3 pt-2">
              <button onClick={() => setOpen(false)} className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800">Cancel</button>
              <button onClick={handleAdd} disabled={!form.title} className="px-4 py-2 text-sm font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-40 transition-colors">Add Task</button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
