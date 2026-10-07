import { ScenarioBrowser } from "@/components/ScenarioBrowser";
import { Page, PageTitle } from "@/components/ui";

export const metadata = { title: "Библиотека" };

export default function LibraryPage() {
  return (
    <Page current="/library">
      <PageTitle title="Библиотека" subtitle="Сохранённые сценарии, избранное и ваши собственные миры." />
      <ScenarioBrowser
        scopes={[
          { id: "library", label: "Всё" },
          { id: "favorites", label: "Избранное" },
          { id: "mine", label: "Мои сценарии" },
        ]}
        initial="library"
      />
    </Page>
  );
}
