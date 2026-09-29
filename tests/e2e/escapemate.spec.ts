import { expect, test, type Page } from "@playwright/test";

// Every test gets a fresh browser context, hence its own demo session cookie and in-memory world.
// Next 16 keeps visited routes mounted but hidden (<Activity>), so text and label lookups are
// filtered to visible elements; role lookups already ignore hidden ones.

async function openCreateForm(page: Page, toggle: string) {
  const button = page.getByRole("button", { name: toggle, exact: true });
  if (!(await button.isVisible())) return; // En escritorio el formulario ya está desplegado.
  // Un clic antes de que React hidrate la página se pierde: se reintenta hasta que se abra.
  await expect(async () => {
    if ((await button.getAttribute("aria-expanded")) !== "true") await button.click();
    await expect(button).toHaveAttribute("aria-expanded", "true", { timeout: 1_000 });
  }).toPass({ timeout: 10_000 });
}

test.describe("public pages", () => {
  test("landing renders primary product entry points", async ({ page }) => {
    await page.goto("/");

    await expect(page.getByRole("link", { name: "EscapeMate" })).toBeVisible();
    await expect(page.getByRole("heading", { name: /Encuentra compañeros de raid/i })).toBeVisible();
    await expect(page.getByRole("link", { name: "Iniciar sesión con Discord" }).first()).toBeVisible();
    await expect(page.getByRole("link", { name: "Busco grupo para jugar ahora" })).toBeVisible();
  });

  test("language selector persists English after reload", async ({ page }) => {
    await page.goto("/");

    await page.getByLabel("Seleccionar idioma").filter({ visible: true }).selectOption("en");
    await expect(page.getByRole("heading", { name: /Find raid teammates/i })).toBeVisible();

    await page.reload();

    await expect(page.getByRole("heading", { name: /Find raid teammates/i })).toBeVisible();
    await expect(page.getByLabel("Select language").filter({ visible: true })).toHaveValue("en");
  });

  test("login page renders Discord OAuth entry", async ({ page }) => {
    await page.goto("/login");

    await expect(page.getByRole("heading", { name: "Iniciar sesión en EscapeMate" })).toBeVisible();
    await expect(page.getByRole("button", { name: /Iniciar sesión con Discord/i })).toBeVisible();
  });
});

test.describe("swipe and matches", () => {
  test("card opens the public profile without exposing Discord", async ({ page }) => {
    await page.goto("/swipe");

    await expect(page.getByText("Swipe de squad").filter({ visible: true })).toBeVisible();
    await expect(page.getByRole("heading", { name: "CustomsSherpa" })).toBeVisible();
    await expect(page.getByText("Habla tu idioma").filter({ visible: true }).first()).toBeVisible();
    await expect(page.getByText("Misma región EU").filter({ visible: true }).first()).toBeVisible();

    await page.locator("article:not([aria-hidden='true'])").click({ position: { x: 200, y: 120 } });

    await expect(page.getByText("Perfil público").filter({ visible: true })).toBeVisible();
    await expect(page.getByText("Estadísticas Tarkov").filter({ visible: true })).toBeVisible();
    await expect(page.getByRole("link", { name: /Abrir Discord/i })).toHaveCount(0);
  });

  test("mutual like opens the match dialog, chat and an answered message", async ({ page }) => {
    await page.goto("/swipe");
    await expect(page.getByRole("heading", { name: "CustomsSherpa" })).toBeVisible();

    await page.getByRole("button", { name: "Me gusta", exact: true }).click();
    const dialog = page.getByRole("dialog", { name: "¡Match!" });
    await expect(dialog).toBeVisible();
    await dialog.getByRole("link", { name: "Abrir chat" }).click();

    await expect(page).toHaveURL(/\/matches\/[0-9a-f-]{36}$/);
    await expect(page.getByText("Discord: customssherpa").filter({ visible: true })).toBeVisible();

    await page.getByRole("textbox", { name: /Coordina mapa/ }).fill("¿Dorms a las 22?");
    await page.getByRole("button", { name: "Enviar" }).click();

    await expect(page.getByText("¿Dorms a las 22?").filter({ visible: true })).toBeVisible();
    await expect(page.getByText("¡Buenas! Esta noche hago Dorms en Customs, ¿te vienes?").filter({ visible: true })).toBeVisible();
  });

  test("passing can be undone and keyboard shortcuts swipe", async ({ page }) => {
    await page.goto("/swipe");
    await expect(page.getByRole("heading", { name: "CustomsSherpa" })).toBeVisible();

    await page.getByRole("button", { name: "Pasar", exact: true }).click();
    await expect(page.getByRole("heading", { name: "KiloRaptor" })).toBeVisible();

    await page.getByRole("button", { name: "Deshacer último pase" }).click();
    await expect(page.getByRole("heading", { name: "CustomsSherpa" })).toBeVisible();

    await page.keyboard.press("ArrowLeft");
    await expect(page.getByRole("heading", { name: "KiloRaptor" })).toBeVisible();
  });

  test("matches list links to chats and blocking removes the match", async ({ page }) => {
    await page.goto("/matches");

    await expect(page.getByRole("heading", { name: "Matches" })).toBeVisible();
    await expect(page.getByText("NightOperator").filter({ visible: true })).toBeVisible();
    await expect(page.getByText("Listo para Customs esta noche.").filter({ visible: true })).toBeVisible();

    await page.getByRole("link", { name: "Abrir chat" }).click();
    await expect(page.getByText("Buenas, ¿hacemos Customs esta noche?").filter({ visible: true })).toBeVisible();

    await page.getByRole("button", { name: "Bloquear" }).first().click();
    await page.getByRole("button", { name: "Sí, bloquear" }).click();

    await expect(page).toHaveURL(/\/matches$/);
    await expect(page.getByText("Todavía no hay matches").filter({ visible: true })).toBeVisible();
  });

  test("reporting a player asks for a reason and confirms", async ({ page }) => {
    await page.goto("/matches");
    await page.getByRole("link", { name: "Abrir chat" }).click();

    await page.getByRole("button", { name: "Reportar" }).first().click();
    await page.getByLabel("Motivo").filter({ visible: true }).first().selectOption("cheating");
    await page.getByRole("button", { name: "Enviar reporte" }).click();

    await expect(page.getByText("Reporte enviado.", { exact: false }).filter({ visible: true })).toBeVisible();
  });
});

test.describe("raid now", () => {
  test("publishing a search, receiving a request and accepting it opens the chat", async ({ page }) => {
    await page.goto("/raid-now");
    await expect(page.getByRole("heading", { name: "Busco grupo para raid ahora" }).first()).toBeVisible();
    await expect(page.getByText("Quest run controlado, sin prisas.").filter({ visible: true })).toBeVisible();

    await openCreateForm(page, "Publicar");
    await expect(page.getByLabel("Jugadores buscados").filter({ visible: true })).toBeVisible();
    await page.getByLabel("Mapa", { exact: true }).filter({ visible: true }).selectOption("Interchange");
    await page.getByRole("button", { name: "Publicar búsqueda" }).click();

    await expect(page.getByText("Búsqueda publicada.").filter({ visible: true })).toBeVisible();
    await expect(page.getByText("Solicitudes pendientes: 1").filter({ visible: true })).toBeVisible();

    await page.getByRole("button", { name: "Aceptar" }).click();
    await expect(page).toHaveURL(/\/matches\/[0-9a-f-]{36}$/);
    await expect(page.getByText("Me apunto. Tengo comms y voy equipado.").filter({ visible: true })).toBeVisible();
  });

  test("joining someone else's search unlocks the chat link", async ({ page }) => {
    await page.goto("/raid-now");

    const post = page.locator("div.rounded-lg", { hasText: "Glukhar en Reserve" }).last();
    await post.getByRole("textbox").fill("Llevo M80 y meds");
    await post.getByRole("button", { name: "Me apunto" }).click();

    await expect(page.getByText("¡Te han aceptado!").filter({ visible: true }).first()).toBeVisible();
    await page.getByRole("link", { name: "Abrir chat" }).first().click();
    await expect(page.getByText("Llevo M80 y meds").filter({ visible: true })).toBeVisible();
  });

  test("game mode filter only shows PvE searches", async ({ page }) => {
    await page.goto("/raid-now?game_mode=PvE");

    await expect(page.getByText("Scav runs tranquilas en PvE. Sin prisa.").filter({ visible: true })).toBeVisible();
    await expect(page.getByText("Quest run controlado, sin prisas.").filter({ visible: true })).toHaveCount(0);
  });
});

test.describe("quest help", () => {
  test("task data locks single-map quests and a request can be published", async ({ page }) => {
    await page.goto("/quest-help");

    await expect(page.getByRole("heading", { name: "Ayuda con misiones" })).toBeVisible();
    await openCreateForm(page, "Publicar");
    await expect(page.locator("#quest-options option[value='The Extortionist']")).toHaveCount(1);

    await page.getByLabel("Misión").filter({ visible: true }).fill("The Extortionist");

    await expect(page.getByText("Skier").filter({ visible: true })).toBeVisible();
    await expect(page.getByText("Mapa bloqueado por la misión seleccionada.").filter({ visible: true })).toBeVisible();
    await expect(page.locator("#map")).toBeDisabled();
    await expect(page.locator('input[type="hidden"][name="map"][value="Customs"]')).toHaveCount(1);

    await page.getByRole("button", { name: "Publicar solicitud" }).click();
    await expect(page.getByText("Solicitud publicada.").filter({ visible: true })).toBeVisible();
    await expect(page.getByText("(tu solicitud)").filter({ visible: true })).toBeVisible();
    await expect(page.getByText("Puedo ayudarte, ya la tengo hecha.").filter({ visible: true })).toBeVisible();
  });

  test("payment language is rejected", async ({ page }) => {
    await page.goto("/quest-help");
    await openCreateForm(page, "Publicar");

    await page.getByLabel("Misión").filter({ visible: true }).fill("Shortage");
    await page.getByLabel("Descripción").filter({ visible: true }).fill("Vendo carry por 10€ vía PayPal");
    await page.getByRole("button", { name: "Publicar solicitud" }).click();

    await expect(page.getByText("No permitimos RMT ni pagos externos.").filter({ visible: true }).last()).toBeVisible();
  });
});

test.describe("profile and settings", () => {
  test("editing the profile to add PvE brings PvE-only players into the queue", async ({ page }) => {
    await page.goto("/onboarding?edit=1");

    await expect(page.getByRole("heading", { name: "Edita tu perfil de raid" })).toBeVisible();
    await expect(page.getByLabel("Nickname").filter({ visible: true })).toBeVisible();
    await expect(page.getByLabel("Idioma principal").filter({ visible: true })).toBeVisible();
    await expect(page.locator('input[name="spoken_languages"][value="IT"]')).toBeVisible();

    await page.locator('input[name="game_modes"][value="PvE"]').check();
    await page.getByRole("button", { name: "Guardar cambios" }).click();

    await expect(page).toHaveURL(/\/settings/);
    await expect(page.getByText("Perfil guardado.").filter({ visible: true })).toBeVisible();
  });

  test("onboarding blocks saving until every section has a choice", async ({ page }) => {
    await page.goto("/onboarding?edit=1");

    for (const value of ["Customs", "Woods"]) {
      await page.locator(`input[name="favorite_maps"][value="${value}"]`).uncheck();
    }
    await page.getByRole("button", { name: "Guardar cambios" }).click();

    await expect(page.getByText("Te falta elegir al menos una opción", { exact: false }).filter({ visible: true })).toBeVisible();
    await expect(page).toHaveURL(/\/onboarding/);
  });

  test("settings shows languages, Tarkov stats and guards account deletion", async ({ page }) => {
    await page.goto("/settings");

    await expect(page.getByRole("heading", { name: "Ajustes" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Idiomas" })).toBeVisible();
    await expect(page.locator('input[name="spoken_languages"][value="ES"]')).toBeChecked();
    await expect(page.getByRole("heading", { name: "Perfil Tarkov" })).toBeVisible();
    await expect(page.getByText("Origen:").filter({ visible: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Sincronizar ahora" })).toBeVisible();

    await page.getByLabel("Escribe ELIMINAR para confirmar").filter({ visible: true }).fill("borrar");
    await page.getByRole("button", { name: "Eliminar cuenta" }).click();
    await expect(page.getByText("Escribe la palabra de confirmación", { exact: false }).filter({ visible: true })).toBeVisible();
  });

  test("mobile navigation sits at the bottom of the screen", async ({ page, isMobile }) => {
    test.skip(!isMobile, "mobile only");
    await page.goto("/swipe");

    const box = await page.getByRole("navigation", { name: "Navegación principal móvil" }).boundingBox();
    const viewport = page.viewportSize();
    expect(box && viewport && box.y + box.height).toBeGreaterThan((viewport?.height ?? 0) - 4);
    await expect(page.getByRole("button", { name: "Cerrar sesión" })).toBeVisible();
  });
});

test.describe("v1.2 experience", () => {
  test("landing explains the product and 404s have their own page", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("heading", { name: "Cómo funciona" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Tu próximo dúo está a un swipe" })).toBeVisible();

    const response = await page.goto("/esto-no-existe");
    expect(response?.status()).toBe(404);
    await expect(page.getByRole("heading", { name: "Esta página no existe" })).toBeVisible();
  });

  test("a new player goes through the three-step onboarding and lands on swipe", async ({ page }) => {
    // Deleting the demo account starts over as a first-time player.
    await page.goto("/settings");
    await page.getByLabel("Escribe ELIMINAR para confirmar").filter({ visible: true }).fill("ELIMINAR");
    await page.getByRole("button", { name: "Eliminar cuenta" }).click();
    await expect(page).toHaveURL(/\/$/);

    await page.goto("/swipe");
    await expect(page).toHaveURL(/\/onboarding/);
    await expect(page.getByText("Paso 1 de 3").filter({ visible: true })).toBeVisible();
    await page.getByRole("button", { name: "Siguiente" }).click();

    await expect(page.getByText("Paso 2 de 3").filter({ visible: true })).toBeVisible();
    await page.getByRole("button", { name: "Siguiente" }).click();
    await expect(page.getByText("Te falta elegir al menos una opción", { exact: false }).filter({ visible: true })).toBeVisible();

    await page.getByText("Chill", { exact: true }).filter({ visible: true }).click();
    await page.getByText("Misiones", { exact: true }).filter({ visible: true }).click();
    await page.getByText("Customs", { exact: true }).filter({ visible: true }).click();
    await page.getByRole("button", { name: "Siguiente" }).click();

    await expect(page.getByText("Paso 3 de 3").filter({ visible: true })).toBeVisible();
    await page.getByText("Noche", { exact: true }).filter({ visible: true }).click();
    await page.getByRole("button", { name: "Guardar y empezar a deslizar" }).click();

    await expect(page).toHaveURL(/\/swipe$/);
    await expect(page.getByRole("heading", { name: "CustomsSherpa" })).toBeVisible();
  });

  test("new matches appear in the top row and Enter sends a chat message", async ({ page }) => {
    await page.goto("/swipe");
    await page.getByRole("button", { name: "Me gusta", exact: true }).click();
    await page.getByRole("button", { name: "Seguir deslizando" }).click();

    await page.goto("/matches");
    await expect(page.getByText("Nuevos matches (1)").filter({ visible: true })).toBeVisible();
    await page.getByRole("link", { name: "Abrir chat: CustomsSherpa" }).click();

    const box = page.getByRole("textbox", { name: /Coordina mapa/ });
    await box.fill("Primera línea");
    await box.press("Shift+Enter");
    await box.pressSequentially("segunda línea");
    await box.press("Enter");

    await expect(page.getByText(/Primera línea\s+segunda línea/).filter({ visible: true })).toBeVisible();
    await expect(box).toHaveValue("");
  });

  test("raid posts show filled seats", async ({ page }) => {
    await page.goto("/raid-now");
    await expect(page.getByText("Plazas 0/3").filter({ visible: true })).toBeVisible();
  });
});
