import { useState, useEffect, useRef, useCallback, useContext } from "react";
import { useNavigate, useParams } from "react-router";
import { apiClient } from "@/lib/api";
import { toast } from "sonner";
import { GuildContext } from "@/state/context";
import { useOnboardingStore } from "@/stores/onboarding";

import { StepIndicator } from "./components/StepIndicator";
import { StepWrapper } from "./components/StepWrapper";
import WelcomeStep from "./components/WelcomeStep";
import TeamsStep from "./components/TeamsStep";
import FormsStep, { type FormsStepRef } from "./components/FormsStep";
import PanelsStep from "./components/PanelsStep";
import SettingsStep, { type SettingsStepRef } from "./components/SettingsStep";
import DoneStep from "./components/DoneStep";

const STEPS = [
  { label: "Welcome", icon: "wave" },
  { label: "Teams", icon: "users" },
  { label: "Forms", icon: "clipboard" },
  { label: "Panels", icon: "layout" },
  { label: "Settings", icon: "cog" },
  { label: "Done", icon: "check" },
];

function Setup() {
  const { guildId } = useParams<{ guildId: string }>();
  const navigate = useNavigate();
  const guild = useContext(GuildContext);

  const { setState: setOnboardingState } = useOnboardingStore();

  const [currentStep, setCurrentStep] = useState(0);
  const [completedSteps, setCompletedSteps] = useState<Set<number>>(new Set());
  const [skippedSteps, setSkippedSteps] = useState<Set<number>>(new Set());
  const [isLoading, setIsLoading] = useState(true);
  const [isAdvancing, setIsAdvancing] = useState(false);

  const [createdTeams, setCreatedTeams] = useState<Array<{ id: number; name: string }>>([]);
  const [createdForms, setCreatedForms] = useState<Array<{ form_id: number; title: string }>>([]);
  const [panelsCreated, setPanelsCreated] = useState(0);

  const formsRef = useRef<FormsStepRef>(null);
  const settingsRef = useRef<SettingsStepRef>(null);

  useEffect(() => {
    if (!guildId) return;

    const loadState = async () => {
      try {
        const res = await apiClient.onboarding.get(guildId);
        const state = res.data;
        setOnboardingState(state);

        if (state.onboarding_completed) {
          setCurrentStep(5);
          setCompletedSteps(new Set([0, 1, 2, 3, 4, 5]));
        } else if (state.current_step > 0) {
          setCurrentStep(state.current_step);
          const completed = new Set<number>();
          for (let i = 0; i < state.current_step; i++) {
            completed.add(i);
          }
          setCompletedSteps(completed);
        }

        const [teamsRes, formsRes] = await Promise.all([
          apiClient.teams.getByGuild(guildId),
          apiClient.forms.getByGuild(guildId),
        ]);
        if (teamsRes.data) {
          setCreatedTeams(teamsRes.data.map((t) => ({ id: t.id, name: t.name })));
        }
        if (formsRes.data) {
          setCreatedForms(
            formsRes.data.map((f) => ({
              form_id: f.form_id,
              title: f.title,
            })),
          );
        }
      } catch {
        toast.error("Failed to load setup state");
      } finally {
        setIsLoading(false);
      }
    };

    loadState();
  }, [guildId, setOnboardingState]);

  const advanceStep = useCallback(
    async (nextStep: number) => {
      if (!guildId) return;
      setIsAdvancing(true);

      try {
        if (nextStep === 3 && formsRef.current) {
          await formsRef.current.save();
        }

        if (nextStep === 5 && settingsRef.current) {
          await settingsRef.current.save();
          await apiClient.onboarding.update(guildId, {
            current_step: 5,
            completed: true,
          });
          setOnboardingState({
            guild_id: guildId,
            onboarding_completed: true,
            onboarding_completed_at: new Date().toISOString(),
            current_step: 5,
            skipped: false,
          });
        } else {
          await apiClient.onboarding.update(guildId, {
            current_step: nextStep,
          });
        }

        setCompletedSteps((prev) => {
          const next = new Set(prev);
          next.add(currentStep);
          return next;
        });
        setCurrentStep(nextStep);
      } catch {
        // Error already toasted by the ref save handlers
      } finally {
        setIsAdvancing(false);
      }
    },
    [guildId, currentStep, setOnboardingState],
  );

  const skipStep = useCallback(async () => {
    if (!guildId) return;

    const nextStep = currentStep + 1;
    try {
      await apiClient.onboarding.update(guildId, { current_step: nextStep });
      setSkippedSteps((prev) => {
        const next = new Set(prev);
        next.add(currentStep);
        return next;
      });
      setCurrentStep(nextStep);
    } catch {
      toast.error("Failed to skip step");
    }
  }, [guildId, currentStep]);

  const skipEntireWizard = useCallback(async () => {
    if (!guildId) return;
    try {
      await apiClient.onboarding.update(guildId, { skipped: true });
      setOnboardingState({
        guild_id: guildId,
        onboarding_completed: false,
        onboarding_completed_at: null,
        current_step: 0,
        skipped: true,
      });
      navigate(`/manage/${guildId}/settings`, { replace: true });
    } catch {
      toast.error("Failed to skip setup");
    }
  }, [guildId, navigate, setOnboardingState]);

  const goToStep = useCallback(
    (step: number) => {
      if (completedSteps.has(step) || skippedSteps.has(step)) {
        setCurrentStep(step);
      }
    },
    [completedSteps, skippedSteps],
  );

  if (isLoading || !guildId || !guild) {
    return (
      <div className="flex items-center justify-center py-20" role="status">
        <div className="text-center">
          <div
            className="mx-auto mb-4 h-10 w-10 animate-spin rounded-full border-b-2 border-blue-500"
            aria-hidden="true"
          />
          <p className="text-gray-400">Loading setup...</p>
        </div>
      </div>
    );
  }

  return (
    <div>
      {currentStep > 0 && currentStep < 5 && (
        <div className="animate-fade-in mb-8">
          <StepIndicator
            steps={STEPS}
            currentStep={currentStep}
            completedSteps={completedSteps}
            skippedSteps={skippedSteps}
            onStepClick={goToStep}
          />
        </div>
      )}

      {currentStep === 0 && (
        <div className="flex min-h-[calc(100dvh-4rem)] items-center justify-center">
          <WelcomeStep
            guildName={guild.name}
            guildIcon={guild.icon}
            guildId={guildId}
            onStart={() => advanceStep(1)}
            onSkip={skipEntireWizard}
          />
        </div>
      )}

      {currentStep === 1 && (
        <div key="step-1" className="animate-fade-in-up">
          <StepWrapper
            title="Create a support team"
            description="Teams let you assign specific roles to handle specific types of tickets. Add at least one team to get started."
            onNext={() => advanceStep(2)}
            onBack={() => setCurrentStep(0)}
            onSkip={skipStep}
            isNextLoading={isAdvancing}
          >
            <TeamsStep
              guildId={guildId}
              roles={(guild.roles ?? []).map((r) => ({
                id: r.id,
                name: r.name,
                color: r.color,
              }))}
              existingTeams={createdTeams}
              onTeamsChange={setCreatedTeams}
            />
          </StepWrapper>
        </div>
      )}

      {currentStep === 2 && (
        <div key="step-2" className="animate-fade-in-up">
          <StepWrapper
            title="Create a ticket form"
            description="Forms collect information from users when they open a ticket. Add questions they must answer before their ticket is created."
            onNext={() => advanceStep(3)}
            onBack={() => setCurrentStep(1)}
            onSkip={skipStep}
            isNextLoading={isAdvancing}
          >
            <FormsStep
              ref={formsRef}
              guildId={guildId}
              existingForms={createdForms}
              onFormsChange={setCreatedForms}
            />
          </StepWrapper>
        </div>
      )}

      {currentStep === 3 && (
        <div key="step-3" className="animate-fade-in-up">
          <StepWrapper
            title="Set up your ticket panel"
            description="A panel is the embed message with a button that users click to open a ticket. Import a template from the gallery or create your own."
            onNext={() => advanceStep(4)}
            onBack={() => setCurrentStep(2)}
            onSkip={skipStep}
            isNextLoading={isAdvancing}
          >
            <PanelsStep
              guildId={guildId}
              channels={(guild.channels ?? []).map((c) => ({
                id: c.id,
                type: c.type,
                name: c.name,
              }))}
              createdTeams={createdTeams}
              createdForms={createdForms}
              onPanelCreated={() => setPanelsCreated((prev) => prev + 1)}
            />
          </StepWrapper>
        </div>
      )}

      {currentStep === 4 && (
        <div key="step-4" className="animate-fade-in-up">
          <StepWrapper
            title="Configure basic settings"
            description="These are the most common settings. You can always change them later from the settings page."
            onNext={() => advanceStep(5)}
            onBack={() => setCurrentStep(3)}
            nextLabel="Finish Setup"
            isNextLoading={isAdvancing}
          >
            <SettingsStep ref={settingsRef} guildId={guildId} />
          </StepWrapper>
        </div>
      )}

      {currentStep === 5 && (
        <div className="flex min-h-[calc(100dvh-4rem)] items-center justify-center">
          <DoneStep
            guildId={guildId}
            teamsCreated={createdTeams.length}
            formsCreated={createdForms.length}
            panelsCreated={panelsCreated}
          />
        </div>
      )}
    </div>
  );
}

export default Setup;
