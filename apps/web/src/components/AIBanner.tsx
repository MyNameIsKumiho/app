"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type { AIStatusDTO } from "@/lib/aiStatus";

export function useAIStatus() {
  return useQuery({ queryKey: ["ai-status"], queryFn: () => api<AIStatusDTO>("/api/ai/status"), staleTime: 60_000 });
}

/** Tells the player plainly when the deterministic demo storyteller is answering instead of a real model. */
export function AIBanner() {
  const { data } = useAIStatus();
  if (!data?.usingMock) return null;
  return (
    <div className="mb-6 rounded-xl border border-ember/30 bg-ember/[0.07] px-4 py-3 text-sm">
      <span className="font-medium text-ember">Демо-рассказчик без AI.</span>{" "}
      <span className="text-parchment/85">Сейчас отвечает встроенный шаблонный рассказчик: механика работает полностью, но текст простой. Подключите Claude, ChatGPT или OpenAI в </span>
      <Link href="/settings" className="text-aether underline-offset-2 hover:underline">
        настройках
      </Link>
      .
    </div>
  );
}
