import { Link } from "react-router-dom";
import type { Meal } from "../api";
import { formatDateTime, formatNumber, titleCase } from "../lib/format";
import { SourceBadge } from "./badges";
import { IconImage, IconPin } from "./icons";

/** Full meal card used on the History grid. */
export function MealCard({ meal }: { meal: Meal }) {
  return (
    <Link to={`/meals/${meal.id}`} className="meal-card">
      <div className={`meal-photo${meal.photo_uri ? "" : " noimg"}`}>
        {meal.photo_uri ? (
          <img src={meal.photo_uri} alt={meal.description} loading="lazy" />
        ) : (
          <IconImage width={28} height={28} />
        )}
        <div className="meal-photo-badges">
          <span className="badge badge-manual" style={{ backdropFilter: "blur(6px)" }}>
            {titleCase(meal.meal_type)}
          </span>
          <SourceBadge source={meal.source} />
        </div>
      </div>
      <div className="meal-body">
        <div className="meal-desc">{meal.description}</div>
        <div className="meal-meta">
          <span>{formatDateTime(meal.eaten_at)}</span>
          {meal.location_text && (
            <>
              <span className="sep">•</span>
              <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
                <IconPin width={13} height={13} />
                {meal.location_text}
              </span>
            </>
          )}
        </div>
        {meal.tags.length > 0 && (
          <div className="tags">
            {meal.tags.slice(0, 4).map((t) => (
              <span key={t} className="tag">
                {t}
              </span>
            ))}
            {meal.tags.length > 4 && (
              <span className="tag">+{meal.tags.length - 4}</span>
            )}
          </div>
        )}
        <div className="macro-row">
          <div className="macro">
            <span className="macro-val">{formatNumber(meal.total_calories)}</span>
            <span className="macro-lbl">kcal</span>
          </div>
          <div className="macro">
            <span className="macro-val">{formatNumber(meal.total_protein_g)}g</span>
            <span className="macro-lbl">protein</span>
          </div>
          <div className="macro">
            <span className="macro-val">{formatNumber(meal.total_carbs_g)}g</span>
            <span className="macro-lbl">carbs</span>
          </div>
          <div className="macro">
            <span className="macro-val">{formatNumber(meal.total_fat_g)}g</span>
            <span className="macro-lbl">fat</span>
          </div>
        </div>
      </div>
    </Link>
  );
}

/** Compact meal card used for Ask citations. */
export function MealCardCompact({ meal }: { meal: Meal }) {
  return (
    <Link to={`/meals/${meal.id}`} className="meal-compact">
      {meal.photo_uri ? (
        <img src={meal.photo_uri} alt={meal.description} loading="lazy" />
      ) : (
        <div className="noimg-thumb">
          <IconImage width={20} height={20} />
        </div>
      )}
      <div className="meal-compact-body">
        <div className="meal-compact-desc">{meal.description}</div>
        <div className="meal-meta" style={{ marginTop: 5 }}>
          <span>{formatDateTime(meal.eaten_at)}</span>
          <span className="sep">•</span>
          <span>{formatNumber(meal.total_calories)} kcal</span>
        </div>
      </div>
    </Link>
  );
}
