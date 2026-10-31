-- 관리자 등록. Authentication > Users에서 계정을 만든 뒤,
-- 아래 이메일을 그 계정으로 바꿔 SQL Editor에서 실행한다.

insert into public.admin_users (user_id)
select id from auth.users where email = 'admin@example.com';
