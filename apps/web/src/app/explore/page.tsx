import { AIBanner } from "@/components/AIBanner";
import { ScenarioBrowser } from "@/components/ScenarioBrowser";
import { Page, PageTitle } from "@/components/ui";

export const metadata = { title: "Исследовать" };

export default function ExplorePage() {
  return (
    <Page current="/explore">
      <AIBanner />
      <PageTitle title="Исследовать" subtitle="Оригинальные миры и фанатские истории. Фильтруйте по жанрам, тону и особенностям." />
      <ScenarioBrowser scopes={[{ id: "explore", label: "Каталог" }]} initial="explore" />
    </Page>
  );
}
