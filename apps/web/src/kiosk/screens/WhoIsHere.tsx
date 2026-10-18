import { useState } from "react";
import { useTranslation } from "react-i18next";
import { PARENT_MODE_MAX_AGE } from "@ralph/shared";
import { Shell } from "../components/Shell";
import { BigButton } from "../components/BigButton";

export interface WhoAnswers {
  first_name: string;
  age_years: number;
  weight_kg?: number;
}

const field =
  "w-full rounded-card border-2 border-unsure bg-surface px-4 py-3 text-2xl outline-none focus:border-secondary";

/** Parent step: synthetic names only in the demo. */
export function WhoIsHere({
  onSubmit,
  busy,
  error,
}: {
  onSubmit: (w: WhoAnswers) => void;
  busy: boolean;
  error: boolean;
}) {
  const { t } = useTranslation();
  const [name, setName] = useState("");
  const [age, setAge] = useState("");
  const [weight, setWeight] = useState("");

  const ageNum = Number(age);
  const weightNum = Number(weight);
  const validAge =
    age !== "" && Number.isFinite(ageNum) && ageNum >= 0 && ageNum <= 18;
  const ageError = age !== "" && !validAge;
  const validWeight =
    weight === "" ||
    (Number.isFinite(weightNum) && weightNum > 0 && weightNum <= 200);
  const weightError = weight !== "" && !validWeight;
  const valid = name.trim().length > 0 && validAge && validWeight;

  return (
    <Shell pose="idle" line={t("who.title")} error={error}>
      <form
        className="flex flex-col gap-4"
        onSubmit={(e) => {
          e.preventDefault();
          if (valid) {
            onSubmit({
              first_name: name.trim(),
              age_years: ageNum,
              weight_kg: weight && weightNum > 0 ? weightNum : undefined,
            });
          }
        }}
      >
        <label className="flex flex-col gap-1 text-lg font-semibold">
          {t("who.name")}
          <input
            className={field}
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={60}
            autoComplete="off"
          />
        </label>
        <label className="flex flex-col gap-1 text-lg font-semibold">
          {t("who.age")}
          <input
            className={`${field} ${ageError ? "border-danger" : ""}`}
            value={age}
            onChange={(e) => setAge(e.target.value)}
            inputMode="decimal"
            type="number"
            min={0}
            max={18}
            step={0.5}
          />
          {ageError && (
            <p
              id="age-error"
              role="alert"
              className="text-base font-semibold text-danger"
            >
              {t("who.ageError")}
            </p>
          )}
        </label>
        {validAge && ageNum < PARENT_MODE_MAX_AGE && (
          <p className="rounded-card bg-surface px-4 py-3 text-lg">
            {t("who.parentModeNote")}
          </p>
        )}
        <label className="flex flex-col gap-1 text-lg font-semibold">
          {t("who.weight")}
          <input
            className={`${field} ${weightError ? "border-danger" : ""}`}
            value={weight}
            onChange={(e) => setWeight(e.target.value)}
            inputMode="decimal"
            type="number"
            min={1}
            max={200}
          />
          {weightError && (
            <p
              id="weight-error"
              role="alert"
              className="text-base font-semibold text-danger"
            >
              {t("who.weightError")}
            </p>
          )}
        </label>
        <BigButton type="submit" tone="primary" disabled={!valid || busy}>
          {t("who.next")}
        </BigButton>
      </form>
    </Shell>
  );
}
