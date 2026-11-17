import { acceptsOptionShortcuts, confirmArgumentRows, humanizeToolName, isInteractiveTarget } from "./warpQuestion.utils";
import { Button } from "@/components/ui/button";
import { isTypingInto, type WarpConfirmAction, type WarpQuestion, type WarpQuestionOption } from "@/components/warp/warpStream.utils";
import { cn } from "@/lib/utils";
import { MessageCircleQuestion, ShieldCheck, TriangleAlert } from "lucide-react";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

interface WarpQuestionCardProps {
	question: WarpQuestion;
	/** Sends the chosen answer. `label` is what was read, `answer` is what Warp receives. */
	onAnswer: (answer: string, label?: string) => void;
	onSkip: () => void;
}

const OPTION_KEYS = ["A", "B", "C", "D", "E", "F", "G", "H"];

export default function WarpQuestionCard({ question, onAnswer, onSkip }: WarpQuestionCardProps) {
	const { t } = useTranslation("shell");
	// Which option is selected. Without it the letter keys and arrows work but
	// look like they do nothing, so the card reads as click-only and the whole
	// keyboard affordance goes unused.
	const [highlighted, setHighlighted] = useState(0);
	const shortcuts = acceptsOptionShortcuts(question);
	// Bound on the document: the card opens while the composer has focus, so card-level keys would need a click.
	useEffect(() => {
		const onKeyDown = (event: KeyboardEvent) => {
			// First, even for Escape: otherwise clearing a draft in the composer skips the question.
			if (isTypingInto(event.target as HTMLTextAreaElement | null)) return;
			// With Skip focused, Enter must press Skip rather than pick the highlighted option.
			if (isInteractiveTarget(event.target as HTMLElement | null)) return;

			if (event.key === "Escape") {
				event.preventDefault();
				// On a confirmation card Esc is Cancel, so the model hears a plain no rather than "use your judgement".
				const cancel = confirmOptions(question)?.cancel;
				if (cancel) onAnswer(cancel.hint || cancel.label, cancel.label);
				else onSkip();
				return;
			}
			if (event.metaKey || event.ctrlKey || event.altKey) return;
			// A confirmation card runs a write: only a click picks Confirm or Cancel.
			if (!acceptsOptionShortcuts(question)) return;
			// Empty options would make the modulo below NaN and crash the panel on the next Enter.
			if (question.options.length === 0) return;

			if (event.key === "ArrowDown") {
				event.preventDefault();
				setHighlighted((current) => (current + 1) % question.options.length);
				return;
			}
			if (event.key === "ArrowUp") {
				event.preventDefault();
				setHighlighted((current) => (current - 1 + question.options.length) % question.options.length);
				return;
			}
			if (event.key === "Enter") {
				event.preventDefault();
				// The options list may have shrunk since highlighted was set.
				const option = question.options[highlighted];
				if (!option) return;
				onAnswer(option.hint || option.label, option.label);
				return;
			}

			const index = OPTION_KEYS.indexOf(event.key.toUpperCase());
			if (index >= 0 && index < question.options.length) {
				event.preventDefault();
				const option = question.options[index];
				onAnswer(option.hint || option.label, option.label);
			}
		};
		document.addEventListener("keydown", onKeyDown);
		return () => document.removeEventListener("keydown", onKeyDown);
	}, [question, highlighted, onAnswer, onSkip]);

	const confirm = confirmOptions(question);
	if (confirm && question.action) {
		return <WarpConfirmCard action={question.action} confirm={confirm.confirm} cancel={confirm.cancel} onAnswer={onAnswer} />;
	}

	return (
		// Opaque base under the 3% tint, or the transcript shows through the floating card.
		<div className="bg-background dark:bg-card rounded-md" data-testid="warp-question">
			<div className="border-primary/25 bg-primary/3 space-y-3 rounded-md border p-3">
				<div className="text-muted-foreground flex items-center gap-2 text-xs font-normal">
					<MessageCircleQuestion className="size-3.5 shrink-0" />
					<span>{t("warp.question.label")}</span>
				</div>

				<p className="text-sm font-medium">{question.question}</p>

				<div className="space-y-1">
					{question.options.map((option, index) => (
						<button
							key={`${option.label}-${index}`}
							type="button"
							// Pointer and keyboard share one highlight so two options never look selected.
							onMouseEnter={() => setHighlighted(index)}
							onClick={() => onAnswer(option.hint || option.label, option.label)}
							data-testid={`warp-question-option-${index}`}
							data-highlighted={index === highlighted ? "" : undefined}
							// Primary wash, not bg-accent: accent is invisible against the card's primary tint.
							className={cn(
								"flex w-full cursor-pointer items-center gap-2.5 rounded-md px-2 py-1.5 text-left text-sm font-normal transition-colors",
								index === highlighted ? "bg-primary/15 text-foreground" : "hover:bg-primary/8",
							)}
						>
							{shortcuts && (
								<kbd
									className={cn(
										"flex size-5 shrink-0 items-center justify-center rounded border font-mono text-[10px]",
										index === highlighted ? "border-primary/40 text-primary bg-background" : "bg-background text-muted-foreground",
									)}
								>
									{OPTION_KEYS[index]}
								</kbd>
							)}
							<span className="min-w-0 flex-1 truncate">{option.label}</span>
						</button>
					))}
				</div>

				<div className="flex items-center justify-end gap-2">
					<Button type="button" variant="ghost" size="sm" onClick={onSkip} data-testid="warp-question-skip" className="font-normal">
						<span className="flex items-center gap-1.5">
							<span>{t("warp.question.skip")}</span>
							<kbd className="text-muted-foreground font-mono text-[10px] leading-none">Esc</kbd>
						</span>
					</Button>
				</div>

				{question.allow_other && <p className="text-muted-foreground text-[11px]">{t("warp.question.orType")}</p>}
			</div>
		</div>
	);
}
/** The Confirm and Cancel options of a confirmation card, or null for any other question. */
function confirmOptions(question: WarpQuestion): { confirm: WarpQuestionOption; cancel: WarpQuestionOption } | null {
	if (question.kind !== "confirm") return null;
	const confirm = question.options.find((option) => option.hint?.startsWith("confirm:"));
	const cancel = question.options.find((option) => option.hint === "cancel");
	return confirm && cancel ? { confirm, cancel } : null;
}

interface WarpConfirmCardProps {
	action: WarpConfirmAction;
	confirm: WarpQuestionOption;
	cancel: WarpQuestionOption;
	onAnswer: (answer: string, label?: string) => void;
}

function WarpConfirmCard({ action, confirm, cancel, onAnswer }: WarpConfirmCardProps) {
	const { t } = useTranslation("shell");
	const rows = confirmArgumentRows(action.arguments);
	const destructive = !!action.destructive;
	const Icon = destructive ? TriangleAlert : ShieldCheck;

	return (
		<div className="bg-background dark:bg-card rounded-sm" data-testid="warp-question" data-kind="confirm">
			<div
				className={cn(
					"flex flex-col gap-3 rounded-sm border p-3",
					destructive ? "border-destructive/30 bg-destructive/3" : "border-primary/25 bg-primary/3",
				)}
			>
				<div className={cn("flex items-center gap-2 text-xs", destructive ? "text-destructive" : "text-muted-foreground")}>
					<Icon className="size-3.5 shrink-0" />
					<span>{destructive ? t("warp.question.confirm.destructiveLabel") : t("warp.question.confirm.label")}</span>
				</div>

				<div className="flex min-w-0 flex-wrap items-baseline gap-x-2 gap-y-1">
					<p className="text-sm font-medium">{humanizeToolName(action.tool)}</p>
					<code className="text-muted-foreground truncate font-mono text-[11px]">{action.tool}</code>
				</div>

				{rows === null ? (
					<pre
						className="bg-background max-h-48 overflow-auto rounded-sm border px-2.5 py-2 font-mono text-xs break-all whitespace-pre-wrap"
						data-testid="warp-confirm-arguments"
					>
						{action.arguments}
					</pre>
				) : rows.length === 0 ? (
					<p className="text-muted-foreground text-xs">{t("warp.question.confirm.noArguments")}</p>
				) : (
					<dl
						className="bg-background grid max-h-48 grid-cols-[minmax(0,auto)_minmax(0,1fr)] gap-x-4 gap-y-1.5 overflow-auto rounded-sm border px-2.5 py-2 text-xs"
						data-testid="warp-confirm-arguments"
					>
						{rows.map((row) => (
							<div key={row.key} className="contents">
								<dt className="text-muted-foreground truncate font-mono">{row.key}</dt>
								<dd
									className={cn(
										"min-w-0 break-words",
										(row.structured || row.empty) && "font-mono",
										row.empty && "text-muted-foreground",
									)}
								>
									{row.value}
								</dd>
							</div>
						))}
					</dl>
				)}

				{destructive && <p className="text-destructive text-xs">{t("warp.question.confirm.cannotUndo")}</p>}

				<div className="flex items-center justify-end gap-2">
					<Button
						type="button"
						variant="outline"
						size="sm"
						onClick={() => onAnswer(cancel.hint || cancel.label, cancel.label)}
						data-testid="warp-question-option-cancel"
						className="font-normal"
					>
						<span>{t("warp.question.confirm.cancel")}</span>
						<kbd className="text-muted-foreground font-mono text-[10px] leading-none">Esc</kbd>
					</Button>
					<Button
						type="button"
						variant={destructive ? "destructive" : "default"}
						size="sm"
						onClick={() => onAnswer(confirm.hint || confirm.label, confirm.label)}
						data-testid="warp-question-option-confirm"
					>
						{t("warp.question.confirm.confirm")}
					</Button>
				</div>
			</div>
		</div>
	);
}
