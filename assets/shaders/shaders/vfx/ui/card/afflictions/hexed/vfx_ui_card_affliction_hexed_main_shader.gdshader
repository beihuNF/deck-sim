shader_type canvas_item;
render_mode blend_mix;

vec2 polar_coordinates(vec2 uv, vec2 center, float zoom, float repeat)
{
	vec2 dir = uv - center;
	float radius = length(dir) * 2.0;
	float angle = atan(dir.y, dir.x) * 1.0/(3.1416 * 2.0);
	return mod(vec2(radius * zoom, angle * repeat), 1.0);
}
vec2 tiling_and_offset(vec2 base_uv, vec4 st, vec2 initial_offset) {
	return (
		(base_uv * st.xy) +
		((st.zw * TIME) + initial_offset)
		);
}
float erosion_from_factors(vec2 factors, float input)
{
	return smoothstep(factors.x, factors.x + factors.y, input);
}

uniform vec4 noise_st = vec4(1.0, 1.0, 0.0, 0.0);
uniform vec2 noise_smoothstep = vec2(0.0, 1.0);

uniform vec4 main_color : source_color;
uniform vec4 bright_color : source_color;
uniform vec4 border_color : source_color;

varying vec4 vertex_color;

void vertex()
{
	vertex_color = COLOR;
}

void fragment()
{
	vec2 polar_uv = polar_coordinates(UV, vec2(0.5, 0.5), 1.0, 1.0);
	polar_uv = tiling_and_offset(polar_uv, noise_st, vec2(0.0));

	vec4 noise_tex = texture(TEXTURE, polar_uv);
	float noise = erosion_from_factors(noise_smoothstep, noise_tex.b);

	vec4 main_tex = texture(TEXTURE, UV);

	vec4 inner_color = mix(main_color, bright_color, noise);
	vec4 color_to_use = mix(border_color, inner_color, main_tex.r);

	COLOR = vec4(color_to_use.rgb * vertex_color.rgb, main_tex.a * vertex_color.a);
}
